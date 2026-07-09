from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from app.database import settings


class RAGService:
    def __init__(self) -> None:
        self._client: Any | None = None
        self._collection: Any | None = None
        self._embedding_tokenizer: Any | None = None
        self._embedding_model: Any | None = None
        self._reranker_tokenizer: Any | None = None
        self._reranker_model: Any | None = None
        self._torch: Any | None = None

    def _load_torch(self) -> Any:
        if self._torch is None:
            import torch

            self._torch = torch
        return self._torch

    def _device(self) -> str:
        torch = self._load_torch()
        configured = (settings.rag_device or "auto").lower()
        if configured in {"auto", "cuda", "gpu"} and torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def device(self) -> str:
        return self._device()

    def collection(self) -> Any:
        if self._collection is None:
            import chromadb

            persist_path = Path(settings.chroma_persist_dir)
            if not persist_path.is_absolute():
                project_root = Path(__file__).resolve().parents[2]
                persist_path = project_root / persist_path
            persist_path.mkdir(parents=True, exist_ok=True)

            self._client = chromadb.PersistentClient(path=str(persist_path))
            self._collection = self._client.get_or_create_collection(
                name=settings.chroma_collection,
                metadata={"hnsw:space": "ip"},
            )
        return self._collection

    def _load_embedding_model(self) -> tuple[Any, Any]:
        if self._embedding_model is None or self._embedding_tokenizer is None:
            from transformers import AutoModel, AutoTokenizer

            self._embedding_tokenizer = AutoTokenizer.from_pretrained(settings.embedding_model)
            self._embedding_model = AutoModel.from_pretrained(settings.embedding_model)
            self._embedding_model.to(self._device())
            self._embedding_model.eval()
        return self._embedding_tokenizer, self._embedding_model

    def _load_reranker_model(self) -> tuple[Any, Any]:
        if self._reranker_model is None or self._reranker_tokenizer is None:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            self._reranker_tokenizer = AutoTokenizer.from_pretrained(settings.reranker_model)
            self._reranker_model = AutoModelForSequenceClassification.from_pretrained(settings.reranker_model)
            self._reranker_model.to(self._device())
            self._reranker_model.eval()
        return self._reranker_tokenizer, self._reranker_model

    @staticmethod
    def _mean_pool(last_hidden_state: Any, attention_mask: Any) -> Any:
        mask = attention_mask.unsqueeze(-1).expand(last_hidden_state.size()).float()
        summed = (last_hidden_state * mask).sum(1)
        counts = mask.sum(1).clamp(min=1e-9)
        return summed / counts

    def embed_text(self, text: str) -> list[float]:
        torch = self._load_torch()
        tokenizer, model = self._load_embedding_model()
        inputs = tokenizer(
            text,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )
        inputs = {key: value.to(self._device()) for key, value in inputs.items()}
        with torch.no_grad():
            outputs = model(**inputs)
            pooled = self._mean_pool(outputs.last_hidden_state, inputs["attention_mask"])
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
        return [float(item) for item in pooled[0].detach().cpu().tolist()]

    @staticmethod
    def dot_product(left: list[float], right: list[float]) -> float:
        size = min(len(left), len(right))
        return float(sum(left[index] * right[index] for index in range(size)))

    def index_chunk(
        self,
        *,
        chunk_id: int,
        document_id: int,
        course_id: int,
        text: str,
        embedding: list[float],
        metadata: dict[str, object] | None = None,
    ) -> None:
        chroma_metadata = {
            "chunk_id": chunk_id,
            "document_id": document_id,
            "course_id": course_id,
            **(metadata or {}),
        }
        self.collection().upsert(
            ids=[f"chunk-{chunk_id}"],
            documents=[text],
            embeddings=[embedding],
            metadatas=[chroma_metadata],
        )

    def delete_document(self, document_id: int) -> None:
        self.collection().delete(where={"document_id": document_id})

    def query(self, course_id: int, question: str, candidates: int = 30) -> list[dict[str, object]]:
        query_embedding = self.embed_text(question)
        result = self.collection().query(
            query_embeddings=[query_embedding],
            n_results=candidates,
            where={"course_id": course_id},
            include=["documents", "metadatas", "embeddings"],
        )

        items: list[dict[str, object]] = []
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        embeddings = result.get("embeddings", [[]])[0]
        for item_id, document, metadata, embedding in zip(ids, documents, metadatas, embeddings):
            vector = [float(value) for value in embedding]
            items.append(
                {
                    "id": item_id,
                    "text": document,
                    "metadata": metadata or {},
                    "dot_score": self.dot_product(query_embedding, vector),
                }
            )
        items.sort(key=lambda item: float(item["dot_score"]), reverse=True)
        return items

    def rerank(self, question: str, candidates: list[dict[str, object]], limit: int = 5) -> list[dict[str, object]]:
        if not candidates:
            return []

        torch = self._load_torch()
        tokenizer, model = self._load_reranker_model()
        pairs = [(question, str(item["text"])) for item in candidates]
        inputs = tokenizer(
            pairs,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )
        inputs = {key: value.to(self._device()) for key, value in inputs.items()}
        with torch.no_grad():
            logits = model(**inputs).logits
            if logits.shape[-1] == 1:
                scores = logits.view(-1)
            else:
                scores = logits[:, -1]

        ranked = []
        for item, score in zip(candidates, scores.detach().cpu().tolist()):
            enriched = dict(item)
            enriched["rerank_score"] = float(score)
            ranked.append(enriched)
        ranked.sort(key=lambda item: float(item["rerank_score"]), reverse=True)
        return ranked[:limit]

    def ready(self) -> bool:
        try:
            self.collection()
            return True
        except Exception:
            return False


def hash_embedding(text_value: str, dimensions: int = 96) -> list[float]:
    from hashlib import md5
    import re

    vector = [0.0] * dimensions
    tokens = re.findall(r"[\w\u4e00-\u9fff]+", text_value.lower())
    if not tokens:
        tokens = list(text_value[:500])
    for token in tokens:
        digest = md5(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(item * item for item in vector)) or 1.0
    return [round(item / norm, 6) for item in vector]


rag_service = RAGService()

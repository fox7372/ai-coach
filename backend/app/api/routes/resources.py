from fastapi import APIRouter

from app.runtime import *
from app.schemas import *
from app.services import *

router = APIRouter()

async def save_uploaded_document(
    db: Session,
    course_id: int,
    parser: Literal["pymupdf", "docling"],
    file: UploadFile,
) -> tuple[Document, int, float]:
    suffix = Path(file.filename or "document.pdf").suffix.lower() or ".pdf"
    filename = Path(file.filename or "document.pdf").name
    file_type = suffix.lstrip(".")
    if file_type not in {"pdf", "ppt", "pptx", "docx"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前只支持 PDF、PPT、PPTX、DOCX 资料上传")
    exists = db.scalar(select(Document).where(Document.course_id == course_id, Document.filename == filename))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"该课程已经上传过同名文件：{filename}")

    target = UPLOAD_DIR / f"{uuid4()}{suffix}"
    with target.open("wb") as output:
        while content := await file.read(1024 * 1024):
            output.write(content)

    document = Document(
        course_id=course_id,
        filename=filename,
        file_type=file_type,
        storage_path=str(target),
        parse_status="processing",
        source_type="word" if file_type == "docx" else None,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    processing_started = time.perf_counter()
    if file_type == "pdf":
        process_pdf_document(db, document, parser)
    elif file_type in {"ppt", "pptx"}:
        process_presentation_document(db, document)
    else:
        process_word_document(db, document)
    db.refresh(document)
    chunk_count = db.scalar(select(func.count()).select_from(DocumentChunk).where(DocumentChunk.document_id == document.id)) or 0
    return document, int(chunk_count), round(time.perf_counter() - processing_started, 2)


def uploaded_document_response(document: Document, chunk_count: int, processing_seconds: float) -> dict[str, object]:
    return {
        "document_id": str(document.id),
        "filename": document.filename,
        "status": document.parse_status,
        "chunk_count": chunk_count,
        "processing_seconds": processing_seconds,
        "parser": document.progress_stage,
        "message": "资料已解析并写入 RAG 切块。" if chunk_count else document.error_message or "文件已保存，但没有生成 RAG 切块。",
    }


@router.post("/documents/upload")
async def upload_document(
    course_id: int = 1,
    parser: Literal["pymupdf", "docling"] = "pymupdf",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_course(db, course_id)
    document, chunk_count, processing_seconds = await save_uploaded_document(db, course_id, parser, file)
    return uploaded_document_response(document, chunk_count, processing_seconds)


@router.post("/documents/upload/batch")
async def upload_documents_batch(
    course_id: int = 1,
    parser: Literal["pymupdf", "docling"] = "pymupdf",
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    require_course(db, course_id)
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少选择一份资料")
    if len(files) > 20:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="单次最多导入 20 份资料")

    results: list[dict[str, object]] = []
    for file in files:
        filename = Path(file.filename or "未命名文件").name
        try:
            document, chunk_count, processing_seconds = await save_uploaded_document(db, course_id, parser, file)
            results.append({"success": document.parse_status == "ready", "resource": document_to_resource(db, document), **uploaded_document_response(document, chunk_count, processing_seconds)})
        except HTTPException as exc:
            results.append({"success": False, "filename": filename, "error": str(exc.detail)})
        except Exception as exc:
            results.append({"success": False, "filename": filename, "error": clean_error_message(exc)})

    success_count = sum(1 for item in results if item["success"])
    return {
        "course_id": course_id,
        "success_count": success_count,
        "failed_count": len(results) - success_count,
        "results": results,
        "message": f"批量导入完成：成功 {success_count} 份，失败 {len(results) - success_count} 份。",
    }


def extract_video_metadata(url: str) -> dict[str, object]:
    try:
        from yt_dlp import YoutubeDL
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="后端缺少 yt-dlp，请先安装 requirements.txt") from exc

    platform = detect_video_platform(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if platform == "bilibili":
        headers["Referer"] = "https://www.bilibili.com/"
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "extract_flat": False,
        "http_headers": headers,
        "socket_timeout": 20,
    }
    try:
        with YoutubeDL(options) as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as exc:
        if platform == "bilibili":
            raise RuntimeError(
                "B 站公开视频元信息读取失败。常见原因是 B 站 412 风控、网络 TLS 中断、视频无公开字幕或需要登录。"
                f"原始错误：{clean_error_message(exc)}"
            ) from exc
        raise


def process_video_document(db: Session, document: Document, preferred_language: str, allow_transcription: bool) -> None:
    document.status = "processing"
    document.progress_stage = "extract_metadata"
    document.error_message = None
    db.commit()

    try:
        info = extract_video_metadata(document.source_url or document.storage_path)
        title = str(info.get("title") or document.filename or "在线视频资料")[:255]
        document.filename = title
        document.author = str(info.get("uploader") or info.get("channel") or "")[:255] or None
        document.duration_seconds = float(info["duration"]) if info.get("duration") is not None else None
        document.thumbnail_url = str(info.get("thumbnail") or "") or None
        document.external_id = str(info.get("id") or "")[:255] or None
        document.raw_content = json.dumps(
            {
                "title": document.filename,
                "uploader": document.author,
                "duration": document.duration_seconds,
                "webpage_url": info.get("webpage_url"),
            },
            ensure_ascii=False,
        )
        document.progress_stage = "fetch_subtitle"
        db.commit()

        subtitle_url, language, subtitle_type = choose_subtitle_track(info, preferred_language)
        if not subtitle_url:
            if allow_transcription:
                raise ValueError("该视频没有可读取字幕。MVP 暂未启用本地语音转写，请先选择带字幕的视频或手动上传文字/PDF。")
            raise ValueError("该视频没有可读取字幕。请换一个公开且带字幕的视频，或勾选允许转写后再重试。")

        subtitle_text = fetch_text_url(subtitle_url)
        segments = parse_subtitle_segments(subtitle_text)
        if not segments:
            raise ValueError("字幕解析失败，未识别到有效时间轴。")

        document.language = language
        document.subtitle_type = subtitle_type
        document.progress_stage = "chunk_and_embed"
        try:
            rag_service.delete_document(document.id)
        except Exception:
            pass
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        chunks = merge_segments_to_chunks(segments)
        for index, chunk in enumerate(chunks):
            chunk_text = str(chunk["text"])
            start_time = float(chunk["start"])
            end_time = float(chunk["end"])
            timestamp_url = build_timestamp_url(document.source_url, start_time)
            db_chunk = DocumentChunk(
                document_id=document.id,
                course_id=document.course_id,
                chunk_text=chunk_text,
                page_number=None,
                start_time=start_time,
                end_time=end_time,
                section_title=f"{format_time(start_time)} - {format_time(end_time)}",
                source_url=timestamp_url,
                metadata_json=json.dumps(
                    {
                        "resource_title": document.filename,
                        "platform": document.platform,
                        "subtitle_type": subtitle_type,
                        "language": language,
                        "source_url": timestamp_url,
                    },
                    ensure_ascii=False,
                ),
                token_count=len(chunk_text),
                chunk_index=index,
                embedding=json.dumps(make_embedding(chunk_text), ensure_ascii=False),
            )
            db.add(db_chunk)
            db.flush()
            index_chunk_in_chroma(db, db_chunk)

        document.status = "ready"
        document.parse_status = "ready"
        document.progress_stage = f"completed:{len(chunks)} chunks"
        db.commit()
    except Exception as exc:
        document.status = "failed"
        document.parse_status = "failed"
        document.progress_stage = "failed"
        document.error_message = clean_error_message(exc)
        db.commit()


@router.post("/api/video/preview")
def preview_video(payload: VideoPreviewRequest) -> dict[str, object]:
    url = normalize_video_url(payload.url)
    try:
        info = extract_video_metadata(url)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    subtitle_url, language, subtitle_type = choose_subtitle_track(info, "zh")
    return {
        "title": info.get("title"),
        "author": info.get("uploader") or info.get("channel"),
        "duration_seconds": info.get("duration"),
        "thumbnail_url": info.get("thumbnail"),
        "platform": detect_video_platform(url),
        "has_subtitle": bool(subtitle_url),
        "subtitle_language": language,
        "subtitle_type": subtitle_type,
    }


@router.post("/api/courses/{course_id}/resources/video", response_model=ResourceOut)
def create_video_resource(course_id: int, payload: VideoResourceCreate, db: Session = Depends(get_db)) -> ResourceOut:
    require_course(db, course_id)

    url = normalize_video_url(payload.url)
    duplicate = db.scalar(
        select(Document).where(Document.course_id == course_id, Document.source_type == "video", Document.source_url == url)
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该课程已经导入过这个视频，请不要重复导入")

    document = Document(
        course_id=course_id,
        filename="在线视频资料",
        file_type="video",
        storage_path=url,
        parse_status="processing",
        source_type="video",
        source_url=url,
        platform=detect_video_platform(url),
        status="processing",
        progress_stage="queued",
        priority=max(1, min(5, payload.priority)),
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    process_video_document(db, document, payload.preferred_language.strip() or "zh", payload.allow_transcription)
    db.refresh(document)
    return document_to_resource(db, document)


@router.post("/api/courses/{course_id}/resources/videos/batch")
def create_video_resources_batch(course_id: int, payload: VideoBatchResourceCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    urls = []
    invalid_results = []
    seen = set()
    for url in payload.urls:
        if not url.strip():
            continue
        try:
            normalized = normalize_video_url(url)
        except HTTPException as exc:
            invalid_results.append({"url": url, "status": "failed", "resource": None, "error": exc.detail})
            continue
        if normalized not in seen:
            urls.append(normalized)
            seen.add(normalized)
    if not urls and not invalid_results:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少输入一个公开视频链接")
    if len(urls) > 20:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MVP 单次最多导入 20 个视频")

    results = invalid_results[:]
    for url in urls:
        try:
            resource = create_video_resource(
                course_id,
                VideoResourceCreate(
                    url=url,
                    preferred_language=payload.preferred_language,
                    allow_transcription=payload.allow_transcription,
                    priority=payload.priority,
                ),
                db,
            )
            results.append({"url": url, "status": resource.status, "resource": resource.model_dump(), "error": resource.error_message})
        except HTTPException as exc:
            results.append({"url": url, "status": "failed", "resource": None, "error": exc.detail})
        except Exception as exc:
            results.append({"url": url, "status": "failed", "resource": None, "error": str(exc)})

    success_count = sum(1 for item in results if item["status"] == "ready")
    return {"total": len(results), "success_count": success_count, "failed_count": len(results) - success_count, "results": results}


@router.post("/api/web/extract")
def extract_webpage(payload: WebExtractRequest) -> dict[str, object]:
    url = validate_public_url(payload.url)
    extracted = extract_webpage_content(url)
    chunks = split_text_to_chunks(str(extracted["text"]))
    return {
        "url": url,
        "title": extracted["title"],
        "text_length": len(str(extracted["text"])),
        "chunk_count": len(chunks),
        "preview": str(extracted["text"])[:1200],
        "links": extracted["links"],
    }


@router.post("/api/courses/{course_id}/resources/webpage", response_model=ResourceOut)
def create_webpage_resource(course_id: int, payload: WebResourceCreate, db: Session = Depends(get_db)) -> ResourceOut:
    require_course(db, course_id)

    url = validate_public_url(payload.url)
    duplicate = db.scalar(
        select(Document).where(Document.course_id == course_id, Document.source_type == "webpage", Document.source_url == url)
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该课程已经导入过这个网页，请不要重复导入")

    document = Document(
        course_id=course_id,
        filename="网页资料",
        file_type="html",
        storage_path=url,
        parse_status="processing",
        source_type="webpage",
        source_url=url,
        platform=urlparse(url).hostname,
        status="processing",
        progress_stage="fetch_webpage",
        priority=max(1, min(5, payload.priority)),
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    try:
        extracted = extract_webpage_content(url)
        document.filename = str(extracted["title"])[:255]
        document.raw_content = str(extracted["text"])
        document.progress_stage = "chunk_and_embed"
        try:
            rag_service.delete_document(document.id)
        except Exception:
            pass
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        chunks = split_text_to_chunks(str(extracted["text"]))
        for index, chunk_text in enumerate(chunks):
            db_chunk = DocumentChunk(
                document_id=document.id,
                course_id=course_id,
                chunk_text=chunk_text,
                page_number=None,
                start_time=None,
                end_time=None,
                section_title=f"网页片段 {index + 1}",
                source_url=url,
                metadata_json=json.dumps(
                    {
                        "resource_title": document.filename,
                        "source_type": "webpage",
                        "source_url": url,
                    },
                    ensure_ascii=False,
                ),
                token_count=len(chunk_text),
                chunk_index=index,
                embedding=json.dumps(make_embedding(chunk_text), ensure_ascii=False),
            )
            db.add(db_chunk)
            db.flush()
            index_chunk_in_chroma(db, db_chunk)
        document.status = "ready"
        document.parse_status = "ready"
        document.progress_stage = f"completed:{len(chunks)} chunks"
        db.commit()
    except Exception as exc:
        document.status = "failed"
        document.parse_status = "failed"
        document.progress_stage = "failed"
        document.error_message = clean_error_message(exc)
        db.commit()

    db.refresh(document)
    return document_to_resource(db, document)


@router.get("/api/courses/{course_id}/resources", response_model=list[ResourceOut])
def list_course_resources(course_id: int, db: Session = Depends(get_db)) -> list[ResourceOut]:
    require_course(db, course_id)
    documents = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.id.desc())).all()
    return [document_to_resource(db, document) for document in documents]


@router.get("/api/resources/{resource_id}", response_model=ResourceOut)
def get_resource(resource_id: int, db: Session = Depends(get_db)) -> ResourceOut:
    document = db.get(Document, resource_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    return document_to_resource(db, document)


@router.post("/api/resources/{resource_id}/retry", response_model=ResourceOut)
def retry_resource(resource_id: int, db: Session = Depends(get_db)) -> ResourceOut:
    document = db.get(Document, resource_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    if document.file_type == "pdf":
        process_pdf_document(db, document)
    elif document.file_type in {"ppt", "pptx"}:
        process_presentation_document(db, document)
    elif document.file_type == "docx":
        process_word_document(db, document)
    elif document.source_type == "video":
        process_video_document(db, document, document.language or "zh", False)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前只支持重试 PDF、PPT/PPTX、DOCX 或视频资料")
    db.refresh(document)
    return document_to_resource(db, document)


@router.delete("/api/resources/{resource_id}")
def delete_resource(resource_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    document = db.get(Document, resource_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    deleted_file = delete_uploaded_file(document.storage_path)
    try:
        rag_service.delete_document(document.id)
    except Exception:
        pass
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == resource_id))
    db.delete(document)
    db.commit()
    return {"status": "deleted", "deleted_file": deleted_file}

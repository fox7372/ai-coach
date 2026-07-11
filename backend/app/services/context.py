from app.runtime import *
from app.schemas import *

def build_references(db: Session, course_id: int) -> list[str]:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    documents = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.id.desc())).all()
    references: list[str] = []

    if course is not None:
        references.append(f"课程：{course.name}")

    if documents:
        for index, document in enumerate(documents[:3], start=1):
            references.append(f"资料 {index}：{document.filename}（当前 MVP 已保存文件，暂未解析到页码）")
    else:
        references.append("暂无上传资料：本次回答主要来自大模型通用知识，建议上传课程 PDF 后再核对。")

    references.append("后续 RAG 完成 document_chunks 后，将精确显示页码、段落和原文片段。")
    return references


def get_course_context(db: Session, course_id: int, fallback_text: str | None = None) -> str:
    chunks = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.course_id == course_id)
        .order_by(DocumentChunk.chunk_index)
        .limit(8)
    ).all()
    if chunks:
        return "\n\n".join(chunk.chunk_text for chunk in chunks)

    documents = db.scalars(select(Document).where(Document.course_id == course_id).order_by(Document.id.desc())).all()
    document_names = "、".join(document.filename for document in documents[:5])
    if fallback_text:
        return fallback_text
    if document_names:
        return f"已上传资料：{document_names}。当前 MVP 尚未解析 PDF 原文，请基于课程主题生成初步内容。"
    return "当前课程暂无上传资料，请基于课程名称生成初步内容。"


def get_course_name(db: Session, course_id: int) -> str:
    course = db.scalar(select(CourseModel).where(CourseModel.id == course_id))
    return course.name if course else f"课程 {course_id}"

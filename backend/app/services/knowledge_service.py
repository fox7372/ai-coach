from app.runtime import *
from app.schemas import *
from app.services.retrieval import compact_excerpt

def is_academic_knowledge_point(name: str, description: str) -> bool:
    name = name.strip().strip("？?·:：-— ")
    description = description.strip()
    text_value = f"{name} {description}"
    blocked_terms = [
        "课时",
        "上课",
        "地点",
        "成绩",
        "期末",
        "期中",
        "分数",
        "deadline",
        "ddl",
        "截止",
        "直播",
        "回看",
        "教科书",
        "参考资料",
        "实验须知",
        "课程安排",
        "课程时间",
    ]
    if any(term.lower() in text_value.lower() for term in blocked_terms):
        return False
    generic_names = {
        "知识点",
        "知识点名称",
        "核心概念",
        "概念",
        "资料",
        "任务内容",
        "computer networking",
        "security",
        "a",
    }
    if name.lower() in generic_names or len(name) < 2:
        return False
    if re.fullmatch(r"[\d\s\\/:：.-]+", name) or re.fullmatch(r"[\d\s\\/:：.-]+", description):
        return False
    return True


def parse_knowledge_point_result(result: str) -> list[dict[str, str]]:
    try:
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, list):
        items = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("知识点") or "").strip().strip("？?·:：-— ")
            description = str(item.get("description") or item.get("说明") or "").strip()
            if name and description and is_academic_knowledge_point(name, description):
                items.append({"name": name, "description": description})
        return items

    items = []
    for line in result.splitlines():
        clean = line.strip().lstrip("-0123456789.、 ")
        separator = "：" if "：" in clean else ":" if ":" in clean else ""
        if not clean or not separator:
            continue
        name, description = clean.split(separator, 1)
        name = name.strip().strip("？?·:：-— ")
        description = description.strip()
        if name and description and is_academic_knowledge_point(name, description):
            items.append({"name": name, "description": description})
    return items


def parse_recommended_resources(result: str, course_name: str) -> tuple[str, list[RecommendedResource]]:
    try:
        parsed = json.loads(result)
    except json.JSONDecodeError:
        parsed = None

    summary = f"已为《{course_name}》生成初步资料清单，建议优先补充教材、课程讲义和练习题。"
    resources: list[RecommendedResource] = []
    if isinstance(parsed, dict):
        summary = str(parsed.get("summary") or summary).strip()
        raw_items = parsed.get("resources")
        if isinstance(raw_items, list):
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title") or "").strip()
                resource_type = str(item.get("resource_type") or item.get("type") or "资料").strip()
                reason = str(item.get("reason") or "").strip()
                keyword = str(item.get("keyword") or title or course_name).strip()
                url = str(item.get("url") or "").strip()
                if not url.startswith(("http://", "https://")):
                    url = ""
                if title and reason:
                    resources.append(
                        RecommendedResource(
                            title=title[:120],
                            resource_type=resource_type[:30],
                            reason=reason[:240],
                            keyword=keyword[:120],
                            url=url[:500],
                        )
                    )
    if resources:
        return summary, resources[:8]

    fallback = [
        RecommendedResource(
            title=f"{course_name} 教材或权威讲义",
            resource_type="教材/讲义",
            reason="作为课程主线资料，用于建立章节结构和核心概念。",
            keyword=f"{course_name} 教材 讲义",
            url="",
        ),
        RecommendedResource(
            title=f"{course_name} 课程主页或公开课",
            resource_type="网页/视频",
            reason="补充授课顺序、案例和教师强调的重点。",
            keyword=f"{course_name} 课程主页 公开课",
            url="",
        ),
        RecommendedResource(
            title=f"{course_name} 习题与错题训练",
            resource_type="习题",
            reason="用于生成测验、发现薄弱点并更新学习计划。",
            keyword=f"{course_name} 习题 答案 解析",
            url="",
        ),
    ]
    return summary, fallback


def is_computer_science_course(course_name: str, learning_goal: str | None) -> bool:
    text_value = f"{course_name} {learning_goal or ''}".lower()
    keywords = [
        "计算机",
        "程序",
        "编程",
        "代码",
        "软件",
        "操作系统",
        "os",
        "数据结构",
        "算法",
        "数据库",
        "计算机网络",
        "网络",
        "编译",
        "机器学习",
        "深度学习",
        "人工智能",
        "ai",
        "python",
        "java",
        "c++",
        "linux",
    ]
    return any(keyword in text_value for keyword in keywords)


def add_cs_diy_resource(resources: list[RecommendedResource]) -> list[RecommendedResource]:
    if any("csdiy.wiki" in item.url for item in resources):
        return resources
    return [
        RecommendedResource(
            title="CS 自学指南",
            resource_type="课程索引/路线",
            reason="计算机相关课程可先从该站点核对公开课、教材、实验和学习路线，再选择合适资料加入平台。",
            keyword="CS 自学指南 计算机课程",
            url="https://csdiy.wiki/",
        ),
        *resources,
    ][:8]


def find_knowledge_support(name: str, chunks: list[DocumentChunk], fallback: DocumentChunk | None) -> tuple[DocumentChunk | None, str | None, bool]:
    lowered = name.lower()
    for chunk in chunks:
        text_value = chunk.chunk_text
        index = text_value.lower().find(lowered)
        if index >= 0:
            start = max(0, index - 80)
            end = min(len(text_value), index + 180)
            return chunk, compact_excerpt(text_value[start:end], 220), True
    if fallback is None:
        return None, None, False
    return fallback, compact_excerpt(fallback.chunk_text, 180), False


def appears_in_chunks(name: str, chunks: list[DocumentChunk]) -> bool:
    lowered = name.lower()
    return any(lowered in chunk.chunk_text.lower() for chunk in chunks)


def is_noisy_knowledge_chunk(chunk: DocumentChunk) -> bool:
    text_value = chunk.chunk_text.strip()
    lowered = text_value.lower()
    if len(text_value) < 80:
        return True
    noisy_terms = [
        "computer networking: a top-down approach",
        "pearson",
        "本章目标",
        "第八章提纲",
        "copyright",
    ]
    if any(term in lowered for term in noisy_terms):
        return True
    if (chunk.page_number or 0) <= 1 and len(text_value) < 1000:
        return True
    return False


def select_knowledge_chunks(all_chunks: list[DocumentChunk], limit: int = 48) -> list[DocumentChunk]:
    useful = [chunk for chunk in all_chunks if not is_noisy_knowledge_chunk(chunk)]
    source = useful or all_chunks
    if len(source) <= limit:
        return source

    # Include both ends and spread samples over the whole document, rather
    # than letting a rounded step leave the final chapters unrepresented.
    return [
        source[round(position * (len(source) - 1) / (limit - 1))]
        for position in range(limit)
    ]


def build_knowledge_context(chunks: list[DocumentChunk], max_chars: int = 60_000) -> str:
    parts: list[str] = []
    remaining = max_chars
    for chunk in chunks:
        text_value = chunk.chunk_text.strip()
        if not text_value or remaining <= 0:
            continue
        if len(text_value) > remaining:
            parts.append(text_value[:remaining])
            break
        parts.append(text_value)
        remaining -= len(text_value) + 2
    return "\n\n".join(parts)


def deduplicate_knowledge_points(items: list[dict[str, str]], limit: int = 24) -> list[dict[str, str]]:
    deduplicated: list[dict[str, str]] = []
    seen_names: set[str] = set()
    for item in items:
        normalized_name = re.sub(r"[\s\W_]+", "", item["name"].lower())
        if not normalized_name or normalized_name in seen_names:
            continue
        seen_names.add(normalized_name)
        deduplicated.append(item)
        if len(deduplicated) >= limit:
            break
    return deduplicated

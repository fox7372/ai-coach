from openai import OpenAI

from app.database import settings


def repair_mojibake(text: str) -> str:
    """Repair common UTF-8 text that was accidentally decoded as Latin-1."""
    markers = ("Ã", "Â", "â", "ï¼", "å", "ç", "è")
    if not any(marker in text for marker in markers):
        return text

    try:
        repaired = text.encode("latin1").decode("utf-8")
    except UnicodeError:
        return text

    # Keep the repaired text only when it clearly reduced mojibake markers.
    old_score = sum(text.count(marker) for marker in markers)
    new_score = sum(repaired.count(marker) for marker in markers)
    return repaired if new_score < old_score else text


class AIService:
    def __init__(self) -> None:
        self.provider = settings.ai_provider
        self.api_key = settings.ai_api_key
        self.base_url = settings.ai_base_url
        self.model = settings.ai_model
        self.reload()

    def reload(self) -> None:
        self.enabled = bool(settings.ai_api_key)
        self.client = None
        if self.enabled:
            self.client = OpenAI(
                api_key=settings.ai_api_key,
                base_url=settings.ai_base_url,
            )
        self.provider = settings.ai_provider
        self.api_key = settings.ai_api_key
        self.base_url = settings.ai_base_url
        self.model = settings.ai_model

    def answer_question(self, question: str, context: str | None = None) -> str:
        system_prompt = (
            "你是严谨的大学课程 AI 助教。请用中文回答学生问题。"
            "必须优先依据给定课程资料片段，不要把没有证据的章节、实验或结论说成确定事实。"
            "如果资料片段不足以支持完整回答，请明确写出“资料中能确认的是”和“需要补充资料确认的是”。"
            "禁止使用“很可能、通常、必然”等词把推测伪装成课程事实；没有资料证据时只能作为通用知识说明。"
            "不要臆造课程章节、实验编号、文件名或网页位置。"
            "回答结构必须包含：1. 直接结论；2. 原理/机制；3. 典型例子；4. 与课程资料的对应依据；5. 建议复习路径。"
            "解释专业术语时要准确，但语言保持适合学生理解。"
        )
        user_content = question
        if context:
            user_content = f"课程资料片段：\n{context}\n\n学生问题：\n{question}"
        return self.generate_text(system_prompt, user_content)

    def generate_text(self, system_prompt: str, user_content: str, temperature: float | None = None) -> str:
        if not self.client:
            return (
                "当前还没有配置 AI_API_KEY，所以先返回演示结果。\n\n"
                f"任务内容：{user_content[:500]}"
            )

        request_kwargs = {}
        if temperature is not None:
            request_kwargs["temperature"] = temperature

        response = self.client.chat.completions.create(
            model=settings.ai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            stream=False,
            **request_kwargs,
        )
        answer = response.choices[0].message.content or "AI 模型没有返回有效内容。"
        return repair_mojibake(answer)

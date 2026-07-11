import json

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


class Utf8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"

    def render(self, content: object) -> bytes:
        return json.dumps(jsonable_encoder(content), ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")

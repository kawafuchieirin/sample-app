"""AWS Lambda エントリポイント。GET /stats を処理する。

API Gateway HTTP API (payload v2.0) から呼ばれ、タスクのステータス別件数を返す。
"""

from __future__ import annotations

import json
from typing import Any

from .repository import count_by_status

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def _response(status_code: int, body: Any = None) -> dict:
    result: dict[str, Any] = {"statusCode": status_code, "headers": CORS_HEADERS}
    if body is not None:
        result["body"] = json.dumps(body, ensure_ascii=False)
    return result


def handler(event: dict, context: object = None) -> dict:
    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if method == "OPTIONS":
        return _response(204)

    if method == "GET":
        return _response(200, count_by_status())

    return _response(405, {"message": "許可されていないメソッドです"})

"""AWS Lambda エントリポイント。API Gateway HTTP API (payload v2.0) を処理する。

ルーティングは (メソッド, リソースのパターン) で分岐する。API Gateway 側で
`GET /tasks`, `POST /tasks`, `GET /tasks/{id}` などのルートを定義し、
`{id}` は pathParameters で受け取る。
"""

from __future__ import annotations

import json
from typing import Any

from .models import ValidationError, apply_updates, build_task
from .repository import TaskRepository

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}


def _response(status_code: int, body: Any = None) -> dict:
    result: dict[str, Any] = {"statusCode": status_code, "headers": CORS_HEADERS}
    if body is not None:
        result["body"] = json.dumps(body, ensure_ascii=False)
    return result


def _parse_body(event: dict) -> dict:
    raw = event.get("body")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValidationError("リクエストボディが不正な JSON です") from exc


def handler(event: dict, context: object = None) -> dict:
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path_params = event.get("pathParameters") or {}
    task_id = path_params.get("id")
    repo = TaskRepository()

    try:
        if method == "OPTIONS":
            return _response(204)

        if method == "GET" and task_id is None:
            return _response(200, repo.list())

        if method == "GET" and task_id is not None:
            task = repo.get(task_id)
            if task is None:
                return _response(404, {"message": "タスクが見つかりません"})
            return _response(200, task)

        if method == "POST":
            task = build_task(_parse_body(event))
            repo.put(task)
            return _response(201, task)

        if method == "PUT" and task_id is not None:
            existing = repo.get(task_id)
            if existing is None:
                return _response(404, {"message": "タスクが見つかりません"})
            updated = apply_updates(existing, _parse_body(event))
            repo.put(updated)
            return _response(200, updated)

        if method == "DELETE" and task_id is not None:
            if repo.get(task_id) is None:
                return _response(404, {"message": "タスクが見つかりません"})
            repo.delete(task_id)
            return _response(204)

        return _response(405, {"message": "許可されていないメソッドです"})

    except ValidationError as exc:
        return _response(400, {"message": str(exc)})

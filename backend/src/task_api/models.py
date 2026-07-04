"""タスクのデータモデルと入力バリデーション。"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

VALID_STATUSES = ("todo", "in_progress", "done")


class ValidationError(ValueError):
    """入力値が不正な場合に送出する例外。"""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def build_task(payload: dict) -> dict:
    """作成リクエストの payload から新規タスクの項目を組み立てる。

    title は必須。status は省略時 "todo"。不正値は ValidationError。
    """
    if not isinstance(payload, dict):
        raise ValidationError("リクエストボディは JSON オブジェクトである必要があります")

    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValidationError("title は必須の文字列です")

    status = payload.get("status", "todo")
    if status not in VALID_STATUSES:
        raise ValidationError(f"status は {VALID_STATUSES} のいずれかです")

    description = payload.get("description", "")
    if not isinstance(description, str):
        raise ValidationError("description は文字列です")

    now = _now_iso()
    return {
        "id": str(uuid.uuid4()),
        "title": title.strip(),
        "description": description,
        "status": status,
        "created_at": now,
        "updated_at": now,
    }


def apply_updates(existing: dict, payload: dict) -> dict:
    """既存タスクに更新 payload を適用した新しい項目を返す。

    指定されたフィールドのみ更新し、updated_at を現在時刻にする。
    """
    if not isinstance(payload, dict):
        raise ValidationError("リクエストボディは JSON オブジェクトである必要があります")

    updated = dict(existing)

    if "title" in payload:
        title = payload["title"]
        if not isinstance(title, str) or not title.strip():
            raise ValidationError("title は空にできません")
        updated["title"] = title.strip()

    if "description" in payload:
        description = payload["description"]
        if not isinstance(description, str):
            raise ValidationError("description は文字列です")
        updated["description"] = description

    if "status" in payload:
        status = payload["status"]
        if status not in VALID_STATUSES:
            raise ValidationError(f"status は {VALID_STATUSES} のいずれかです")
        updated["status"] = status

    updated["updated_at"] = _now_iso()
    return updated

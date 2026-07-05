#!/usr/bin/env python3
"""ローカル開発用の軽量タスク API サーバ。

LocalStack Community は API Gateway v2(HTTP API) と Lambda(python3.13) を扱えないため、
本番と同じ Python ハンドラ(task_api / stats_api)を **そのまま再利用** して HTTP で公開する。
DynamoDB は LocalStack のものを使う（AWS_ENDPOINT_URL）。ロジックは複製せず、ハンドラを
API Gateway v2(payload v2.0) 形式のイベントに変換して呼ぶだけ。

用途: フロント(VITE_API_URL) と AI ゲートウェイ(TASK_API_URL) の両方がこのサーバを指す。

起動: `make local-api`  （前提: `make local-up` で LocalStack 稼働）
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# LocalStack 向けの既定環境（未設定なら投入）。boto3 の前に設定する。
os.environ.setdefault("AWS_ENDPOINT_URL", "http://localhost:4566")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-northeast-1")
os.environ.setdefault("TABLE_NAME", "taskapp-local-tasks")

REPO_ROOT = Path(__file__).resolve().parent.parent
# 既存ハンドラを import できるよう backend/src と api/src を通す。
sys.path.insert(0, str(REPO_ROOT / "backend" / "src"))
sys.path.insert(0, str(REPO_ROOT / "api" / "src"))

import boto3  # noqa: E402  (パス設定後に import する)
from task_api.handler import handler as task_handler  # noqa: E402
from stats_api.handler import handler as stats_handler  # noqa: E402

# 8080 は Docker 等と競合しやすいため、ゲートウェイ(8787)の隣 8788 を既定にする。
PORT = int(os.environ.get("LOCAL_API_PORT", "8788"))
TABLE_NAME = os.environ["TABLE_NAME"]


def ensure_table() -> None:
    """DynamoDB テーブルが無ければ作成する（module.database と同じスキーマ: id が HASH）。"""
    ddb = boto3.client("dynamodb", endpoint_url=os.environ["AWS_ENDPOINT_URL"])
    existing = ddb.list_tables().get("TableNames", [])
    if TABLE_NAME in existing:
        return
    print(f"[local-api] テーブル {TABLE_NAME} を作成します")
    ddb.create_table(
        TableName=TABLE_NAME,
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        BillingMode="PAY_PER_REQUEST",
    )
    ddb.get_waiter("table_exists").wait(TableName=TABLE_NAME)


def build_event(method: str, path: str, task_id: str | None, body: str | None) -> dict:
    """API Gateway HTTP API (payload v2.0) 形式のイベントを組み立てる。"""
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "pathParameters": {"id": task_id} if task_id else None,
        "body": body,
    }


class Handler(BaseHTTPRequestHandler):
    # ログを簡素化
    def log_message(self, fmt: str, *args: object) -> None:  # noqa: A003
        print(f"[local-api] {self.command} {self.path} -> {args[1] if len(args) > 1 else ''}")

    def _dispatch(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length).decode("utf-8") if length else None

        parts = [p for p in path.split("/") if p]  # ["tasks", id?] / ["stats"]

        if parts[:1] == ["stats"]:
            result = stats_handler(build_event(self.command, path, None, body))
        elif parts[:1] == ["tasks"]:
            task_id = parts[1] if len(parts) > 1 else None
            result = task_handler(build_event(self.command, path, task_id, body))
        else:
            result = {"statusCode": 404, "headers": {"Content-Type": "application/json"},
                      "body": json.dumps({"message": "not found"})}

        status = result.get("statusCode", 200)
        self.send_response(status)
        for key, value in (result.get("headers") or {}).items():
            self.send_header(key, value)
        self.end_headers()
        payload = result.get("body")
        if payload:
            self.wfile.write(payload.encode("utf-8"))

    # すべての主要メソッドを同じディスパッチャへ
    do_GET = _dispatch
    do_POST = _dispatch
    do_PUT = _dispatch
    do_DELETE = _dispatch
    do_OPTIONS = _dispatch


def main() -> None:
    ensure_table()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[local-api] listening on http://127.0.0.1:{PORT}  (TABLE_NAME={TABLE_NAME})")
    print("[local-api]   GET/POST/PUT/DELETE /tasks , GET /stats")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[local-api] shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()

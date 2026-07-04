"""DynamoDB へのアクセス層。

AWS_ENDPOINT_URL 環境変数が設定されていれば LocalStack など任意のエンドポイントへ
接続する。未設定なら通常の AWS へ接続する。これによりアプリコードを環境非依存に保つ。
"""

from __future__ import annotations

import os
from functools import lru_cache

import boto3


@lru_cache(maxsize=1)
def _table():
    endpoint_url = os.environ.get("AWS_ENDPOINT_URL") or None
    table_name = os.environ["TABLE_NAME"]
    resource = boto3.resource("dynamodb", endpoint_url=endpoint_url)
    return resource.Table(table_name)


class TaskRepository:
    """tasks テーブルに対する CRUD 操作。"""

    def list(self) -> list[dict]:
        # 小規模想定のため scan。大規模化する場合は GSI + query に置き換える。
        response = _table().scan()
        items = response.get("Items", [])
        while "LastEvaluatedKey" in response:
            response = _table().scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            items.extend(response.get("Items", []))
        return items

    def get(self, task_id: str) -> dict | None:
        response = _table().get_item(Key={"id": task_id})
        return response.get("Item")

    def put(self, task: dict) -> dict:
        _table().put_item(Item=task)
        return task

    def delete(self, task_id: str) -> None:
        _table().delete_item(Key={"id": task_id})

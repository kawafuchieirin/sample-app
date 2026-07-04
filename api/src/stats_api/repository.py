"""DynamoDB からタスクを読み取り、統計を集計する層。

task_api と同じ tasks テーブルを参照する。AWS_ENDPOINT_URL があれば
LocalStack 等へ、無ければ通常の AWS へ接続する（環境非依存）。
"""

from __future__ import annotations

import os
from functools import lru_cache

import boto3

# task_api.models と同じステータス定義に揃える。
VALID_STATUSES = ("todo", "in_progress", "done")


@lru_cache(maxsize=1)
def _table():
    endpoint_url = os.environ.get("AWS_ENDPOINT_URL") or None
    table_name = os.environ["TABLE_NAME"]
    resource = boto3.resource("dynamodb", endpoint_url=endpoint_url)
    return resource.Table(table_name)


def count_by_status() -> dict:
    """ステータス別の件数と合計を返す。

    例: {"total": 3, "todo": 1, "in_progress": 1, "done": 1}
    未知のステータスは "unknown" に集約する。
    """
    counts = {status: 0 for status in VALID_STATUSES}
    counts["unknown"] = 0
    total = 0

    # status 属性のみを射影して scan（ページネーション対応）。
    response = _table().scan(ProjectionExpression="#s", ExpressionAttributeNames={"#s": "status"})
    items = response.get("Items", [])
    while "LastEvaluatedKey" in response:
        response = _table().scan(
            ProjectionExpression="#s",
            ExpressionAttributeNames={"#s": "status"},
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))

    for item in items:
        status = item.get("status")
        if status in counts:
            counts[status] += 1
        else:
            counts["unknown"] += 1
        total += 1

    counts["total"] = total
    return counts

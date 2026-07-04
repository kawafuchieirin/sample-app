"""pytest 共通フィクスチャ。moto で DynamoDB をモックする。"""

from __future__ import annotations

import importlib

import boto3
import pytest
from moto import mock_aws

TABLE_NAME = "tasks-test"


@pytest.fixture()
def dynamodb_table(monkeypatch):
    monkeypatch.setenv("TABLE_NAME", TABLE_NAME)
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-northeast-1")
    # LocalStack 用の endpoint 上書きが残っているとモックに接続できないため除去する。
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)

    with mock_aws():
        client = boto3.client("dynamodb", region_name="ap-northeast-1")
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )

        # repository はテーブルを lru_cache するため、モック確立後に再読み込みして
        # キャッシュをクリアする。
        from task_api import repository

        importlib.reload(repository)
        yield

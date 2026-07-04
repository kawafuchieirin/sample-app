"""統計 API ハンドラの振る舞いテスト。"""

from __future__ import annotations

import json

import pytest


def _event(method: str = "GET") -> dict:
    return {"requestContext": {"http": {"method": method}}}


def _call(method="GET"):
    from stats_api.handler import handler

    return handler(_event(method))


def _json(response: dict):
    return json.loads(response["body"])


@pytest.mark.usefixtures("dynamodb_table")
def test_empty_table_returns_all_zero():
    res = _call("GET")
    assert res["statusCode"] == 200
    body = _json(res)
    assert body == {"todo": 0, "in_progress": 0, "done": 0, "unknown": 0, "total": 0}


def test_counts_by_status(dynamodb_table):
    table = dynamodb_table
    table.put_item(Item={"id": "1", "title": "a", "status": "todo"})
    table.put_item(Item={"id": "2", "title": "b", "status": "todo"})
    table.put_item(Item={"id": "3", "title": "c", "status": "in_progress"})
    table.put_item(Item={"id": "4", "title": "d", "status": "done"})

    res = _call("GET")
    assert res["statusCode"] == 200
    body = _json(res)
    assert body["total"] == 4
    assert body["todo"] == 2
    assert body["in_progress"] == 1
    assert body["done"] == 1
    assert body["unknown"] == 0


def test_unknown_status_is_bucketed(dynamodb_table):
    dynamodb_table.put_item(Item={"id": "x", "title": "x", "status": "archived"})
    body = _json(_call("GET"))
    assert body["unknown"] == 1
    assert body["total"] == 1


@pytest.mark.usefixtures("dynamodb_table")
def test_options_returns_204():
    res = _call("OPTIONS")
    assert res["statusCode"] == 204


@pytest.mark.usefixtures("dynamodb_table")
def test_post_not_allowed():
    res = _call("POST")
    assert res["statusCode"] == 405

"""Lambda ハンドラの振る舞いテスト。"""

from __future__ import annotations

import json

import pytest


def _event(method: str, task_id: str | None = None, body: dict | None = None) -> dict:
    event: dict = {
        "requestContext": {"http": {"method": method}},
        "pathParameters": {"id": task_id} if task_id else None,
    }
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def _call(method, task_id=None, body=None):
    # フィクスチャによるモック確立後に import する。
    from task_api.handler import handler

    return handler(_event(method, task_id, body))


def _json(response: dict):
    return json.loads(response["body"])


@pytest.mark.usefixtures("dynamodb_table")
def test_create_task_returns_201_with_generated_fields():
    res = _call("POST", body={"title": "買い物", "description": "牛乳"})
    assert res["statusCode"] == 201
    task = _json(res)
    assert task["title"] == "買い物"
    assert task["description"] == "牛乳"
    assert task["status"] == "todo"
    assert task["id"]
    assert task["created_at"] == task["updated_at"]


@pytest.mark.usefixtures("dynamodb_table")
def test_create_task_without_title_returns_400():
    res = _call("POST", body={"description": "titleなし"})
    assert res["statusCode"] == 400


@pytest.mark.usefixtures("dynamodb_table")
def test_create_task_with_invalid_status_returns_400():
    res = _call("POST", body={"title": "x", "status": "unknown"})
    assert res["statusCode"] == 400


@pytest.mark.usefixtures("dynamodb_table")
def test_list_returns_created_tasks():
    _call("POST", body={"title": "a"})
    _call("POST", body={"title": "b"})
    res = _call("GET")
    assert res["statusCode"] == 200
    titles = sorted(t["title"] for t in _json(res))
    assert titles == ["a", "b"]


@pytest.mark.usefixtures("dynamodb_table")
def test_get_single_task():
    created = _json(_call("POST", body={"title": "詳細確認"}))
    res = _call("GET", task_id=created["id"])
    assert res["statusCode"] == 200
    assert _json(res)["id"] == created["id"]


@pytest.mark.usefixtures("dynamodb_table")
def test_get_missing_task_returns_404():
    res = _call("GET", task_id="does-not-exist")
    assert res["statusCode"] == 404


@pytest.mark.usefixtures("dynamodb_table")
def test_update_task_changes_fields_and_updated_at():
    created = _json(_call("POST", body={"title": "旧"}))
    res = _call("PUT", task_id=created["id"], body={"title": "新", "status": "done"})
    assert res["statusCode"] == 200
    updated = _json(res)
    assert updated["title"] == "新"
    assert updated["status"] == "done"
    assert updated["created_at"] == created["created_at"]


@pytest.mark.usefixtures("dynamodb_table")
def test_update_missing_task_returns_404():
    res = _call("PUT", task_id="nope", body={"title": "x"})
    assert res["statusCode"] == 404


@pytest.mark.usefixtures("dynamodb_table")
def test_delete_task_then_get_returns_404():
    created = _json(_call("POST", body={"title": "消す"}))
    del_res = _call("DELETE", task_id=created["id"])
    assert del_res["statusCode"] == 204
    assert _call("GET", task_id=created["id"])["statusCode"] == 404


@pytest.mark.usefixtures("dynamodb_table")
def test_delete_missing_task_returns_404():
    assert _call("DELETE", task_id="nope")["statusCode"] == 404


@pytest.mark.usefixtures("dynamodb_table")
def test_options_returns_cors_headers():
    res = _call("OPTIONS")
    assert res["statusCode"] == 204
    assert res["headers"]["Access-Control-Allow-Origin"] == "*"

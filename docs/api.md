# API リファレンス

タスク管理 API の詳細。高レベルな契約は [SPEC.md](../SPEC.md) を参照。

- ベース URL: 環境ごとの API Gateway エンドポイント（`VITE_API_URL` に設定される値）
- 形式: JSON（リクエスト/レスポンスとも）
- CORS: すべてのオリジンを許可（`Access-Control-Allow-Origin: *`）

2 つの Lambda が同一の HTTP API にルーティングされる。

| リソース | 担当ディレクトリ | 実装 |
| --- | --- | --- |
| `/tasks` 系（CRUD） | `backend/` | [backend/src/task_api/handler.py](../backend/src/task_api/handler.py) |
| `/stats`（統計） | `api/` | [api/src/stats_api/handler.py](../api/src/stats_api/handler.py) |

## タスクリソース

```jsonc
{
  "id": "b5f48261-...",        // UUID（サーバ生成）
  "title": "買い物",            // 必須
  "description": "牛乳",        // 任意（既定 ""）
  "status": "todo",            // "todo" | "in_progress" | "done"（既定 "todo"）
  "created_at": "2026-07-04T15:45:56.395073+00:00",  // ISO8601（サーバ生成）
  "updated_at": "2026-07-04T15:45:56.395073+00:00"
}
```

## エンドポイント

### `GET /tasks` — 一覧取得

全タスクを配列で返す。

- `200 OK` → `Task[]`

### `POST /tasks` — 作成

- リクエスト: `{ "title": string, "description"?: string, "status"?: Status }`
- `201 Created` → 作成された `Task`
- `400 Bad Request` → `title` 欠落、`status` が不正値、ボディが不正 JSON

### `GET /tasks/{id}` — 単一取得

- `200 OK` → `Task`
- `404 Not Found` → 該当なし

### `PUT /tasks/{id}` — 更新

指定フィールドのみ部分更新し、`updated_at` を現在時刻にする。

- リクエスト: `{ "title"?: string, "description"?: string, "status"?: Status }`
- `200 OK` → 更新後の `Task`
- `400 Bad Request` → `title` が空、`status` が不正、ボディが不正 JSON
- `404 Not Found` → 該当なし

### `DELETE /tasks/{id}` — 削除

- `204 No Content` → 削除成功
- `404 Not Found` → 該当なし

### `GET /stats` — タスク統計

タスクをステータス別に集計して返す（`api/` の統計 Lambda が担当）。

- `200 OK` →

  ```json
  { "total": 3, "todo": 1, "in_progress": 1, "done": 1, "unknown": 0 }
  ```

  `unknown` は既定 3 ステータス以外の値を集約したもの。

## エラーレスポンス

`4xx` はメッセージ付き JSON を返す。

```json
{ "message": "title は必須の文字列です" }
```

## 動作確認例（curl）

```bash
API="https://<api-id>.execute-api.<region>.amazonaws.com"

# 作成
curl -X POST "$API/tasks" -H "Content-Type: application/json" \
  -d '{"title":"買い物","description":"牛乳"}'

# 一覧
curl "$API/tasks"

# 更新（完了にする）
curl -X PUT "$API/tasks/<id>" -H "Content-Type: application/json" \
  -d '{"status":"done"}'

# 削除
curl -X DELETE "$API/tasks/<id>"
```

## バリデーション仕様

[backend/src/task_api/models.py](../backend/src/task_api/models.py) が入力を検証する。

- `title`: 必須の非空文字列（前後空白は trim）
- `status`: `todo` / `in_progress` / `done` のいずれか
- `description`: 文字列（省略時 `""`）

これらの振る舞いは [backend/tests/test_handler.py](../backend/tests/test_handler.py) でテストしている。

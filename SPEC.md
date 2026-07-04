# タスク管理アプリ 設計書 (SPEC)

## 概要

シンプルなタスク管理アプリケーション。AWS を本番環境とし、ローカル環境は LocalStack で
AWS と同一の Terraform 定義を適用することで、本番との差分を最小化する。

## アーキテクチャ

```
                    ┌──────────────────────────────────────────────┐
                    │                   AWS (prod)                    │
  ユーザー ──────►  │  CloudFront ──► S3 (静的サイト: React SPA)      │
                    │       │                                         │
                    │       └─(/api/*)─► API Gateway (HTTP API)       │
                    │                        │                        │
                    │                     Lambda (Python)             │
                    │                        │                        │
                    │                     DynamoDB (tasks テーブル)   │
                    └──────────────────────────────────────────────┘

  ローカル: 同じ Terraform を LocalStack (Docker) に適用して同一構成を再現
```

## 技術スタック

| レイヤ      | 技術                                    |
| ----------- | --------------------------------------- |
| Frontend    | React 18 + Vite + TypeScript (SPA)      |
| Backend     | Python 3.13 + AWS Lambda                |
| API         | API Gateway HTTP API (Lambda proxy)     |
| Database    | DynamoDB                                |
| IaC         | Terraform (モジュール分割)              |
| ローカル環境 | LocalStack + Docker Compose             |
| CI/CD       | GitHub Actions (OIDC 認証)              |
| ランタイム管理 | mise                                  |

## ディレクトリ構成

```
sample-app/
├── SPEC.md                      # 本ファイル
├── .mise.toml                   # ランタイム/ツールのバージョン
├── docker-compose.yml           # LocalStack
├── Makefile                     # よく使うコマンドの集約
├── frontend/                    # React + Vite + TS
│   ├── src/
│   └── package.json
├── backend/                     # タスクCRUD API (Python Lambda)
│   ├── src/task_api/
│   └── tests/
├── api/                         # タスク統計 API (Python Lambda)
│   ├── src/stats_api/
│   └── tests/
├── infra/                       # Terraform
│   ├── modules/
│   │   ├── database/            # DynamoDB
│   │   ├── backend/             # Lambda + API Gateway + IAM
│   │   ├── stats/               # 統計 Lambda + 既存 API へのルート追加
│   │   └── frontend/            # S3 + CloudFront
│   └── environments/
│       ├── local/               # LocalStack 向け
│       └── prod/                # AWS 向け
├── scripts/                     # ローカル運用スクリプト
└── .github/workflows/           # CI/CD
```

## データモデル

DynamoDB テーブル `tasks`

| 属性        | 型     | 説明                                   |
| ----------- | ------ | -------------------------------------- |
| id (PK)     | String | UUID                                   |
| title       | String | タスク名 (必須)                        |
| description | String | 詳細 (任意)                            |
| status      | String | `todo` / `in_progress` / `done`        |
| created_at  | String | ISO8601                                |
| updated_at  | String | ISO8601                                |

## API 仕様 (base path: `/tasks`)

| メソッド | パス           | 説明             | リクエストボディ                         |
| -------- | -------------- | ---------------- | ---------------------------------------- |
| GET      | `/tasks`       | 一覧取得         | -                                        |
| POST     | `/tasks`       | 作成             | `{title, description?, status?}`         |
| GET      | `/tasks/{id}`  | 単一取得         | -                                        |
| PUT      | `/tasks/{id}`  | 更新             | `{title?, description?, status?}`        |
| DELETE   | `/tasks/{id}`  | 削除             | -                                        |
| GET      | `/stats`       | タスク統計       | -                                        |

`/tasks` 系は `backend`(task_api)、`/stats` は `api`(stats_api) の別 Lambda が担当し、
同一の HTTP API にルーティングする。レスポンスは JSON。CORS を有効化する。

`/stats` のレスポンス例:

```json
{ "total": 3, "todo": 1, "in_progress": 1, "done": 1, "unknown": 0 }
```

## 本番とローカルの差分最小化の方針

1. **同一 Terraform コード**: `infra/modules/*` は prod/local 共通。環境差分は
   `environments/*` の変数と provider 設定のみに閉じ込める。
2. **LocalStack**: S3 / Lambda / API Gateway / DynamoDB / IAM をローカルの Docker で
   エミュレートし、`tflocal`(または endpoint 上書き) で同じリソースを作成する。
3. **アプリコードの環境非依存化**: バックエンドは `AWS_ENDPOINT_URL` 環境変数が
   あればそれを使う(LocalStack)。無ければ通常の AWS へ接続する(prod)。
4. **設定の外部化**: フロントの API URL は `VITE_API_URL`、DynamoDB テーブル名は
   `TABLE_NAME` など、すべて環境変数で注入する。

## CI/CD

- **CI (ci.yml)**: PR 時に frontend(lint/build) と backend(lint/pytest) を検証。
- **CD (deploy.yml)**: main への push で AWS へデプロイ。
  1. Terraform apply (infra)
  2. Lambda パッケージのビルドとデプロイ
  3. フロントをビルドして S3 へ同期、CloudFront をキャッシュ無効化
- 認証は GitHub OIDC による IAM ロール引き受け(長期キーを保存しない)。

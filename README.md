# sample-app — タスク管理アプリ

React + AWS Lambda(Python) + DynamoDB によるシンプルなタスク管理アプリ。
本番は AWS（CloudFront + S3 / API Gateway + Lambda / DynamoDB）、
ローカルは **LocalStack** に同じ Terraform を適用して本番との差分を最小化する。

## アーキテクチャ

```
ユーザー ─► CloudFront ─► S3 (React SPA)
                │
                │                         ┌─► Lambda: task_api (/tasks)  ─┐
                └─► API Gateway (HTTP API)┤                              ├─► DynamoDB
                                          └─► Lambda: stats_api (/stats) ─┘
```

| レイヤ    | 技術                              |
| --------- | --------------------------------- |
| Frontend  | React + Vite + TypeScript         |
| Backend   | Python 3.13 + AWS Lambda          |
| API       | API Gateway HTTP API              |
| Database  | DynamoDB                          |
| IaC       | Terraform                         |
| ローカル  | LocalStack + Docker Compose       |
| CI/CD     | GitHub Actions (OIDC)             |

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [SPEC.md](./SPEC.md) | 設計仕様（アーキテクチャ・データモデル・差分最小化方針） |
| [docs/development.md](./docs/development.md) | 開発ガイド（セットアップ・ローカル実行・テスト） |
| [docs/deployment.md](./docs/deployment.md) | デプロイ / CI・CD ガイド（OIDC・運用・既知の課題） |
| [docs/api.md](./docs/api.md) | API リファレンス |
| [infra/bootstrap/README.md](./infra/bootstrap/README.md) | OIDC 認証基盤のセットアップ |

## ディレクトリ構成

```
frontend/   React + Vite + TS
backend/    タスクCRUD API — Python Lambda (src/task_api) + tests
api/        タスク統計 API — Python Lambda (src/stats_api) + tests
infra/      Terraform (modules/ と environments/{local,prod}, bootstrap/)
scripts/    ローカル運用スクリプト
docs/       ドキュメント
.github/    CI/CD ワークフロー
```

## クイックスタート

```bash
mise install      # ランタイム/ツールを導入（要 mise, Docker）
make setup        # フロント/バックエンドの依存を導入
make local-up     # LocalStack を起動
make local-deploy # ローカルにデプロイ（Site/API の URL が出力される）
```

詳しい手順は [開発ガイド](./docs/development.md) を参照。主な `make` ターゲットは `make help` で一覧できる。

## テスト・検証

```bash
make test-backend    # pytest（moto で DynamoDB をモック）
make test-api        # 統計API の pytest
make lint-frontend   # tsc 型チェック
make tf-validate     # Terraform validate（local/prod）
```

## 本番デプロイ

`main` への push で本番へ自動デプロイ（GitHub OIDC 認証）。初回は OIDC ロールの作成と
リポジトリ変数の登録が必要。手順・仕組み・**既知の課題（ステート永続化）**は
[デプロイ / CI・CD ガイド](./docs/deployment.md) を参照。

## API

タスク CRUD（`/tasks`）と統計（`/stats`）を提供する。`/tasks` は `backend/`、`/stats` は
`api/` の別 Lambda が担当し、同一の HTTP API にルーティングされる（フロントからは同じ
ベース URL で呼べる）。詳細は [API リファレンス](./docs/api.md) を参照。

## 本番とローカルの差分最小化

- `infra/modules/*` は prod/local 共通。差分は `environments/*` の変数と provider 設定に限定。
- バックエンドは `AWS_ENDPOINT_URL` があれば LocalStack、無ければ AWS を利用（コードは環境非依存）。
- CloudFront は LocalStack 非対応のため `enable_cloudfront` 変数で prod のみ有効化し、
  ローカルは S3 ウェブサイトホスティングで代替する（差分はこの一点に集約）。

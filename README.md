# sample-app — タスク管理アプリ

React + AWS Lambda(Python) + DynamoDB によるシンプルなタスク管理アプリ。
本番は AWS（CloudFront + S3 / API Gateway + Lambda / DynamoDB）、
ローカルは **LocalStack** に同じ Terraform を適用して本番との差分を最小化する。

詳細な設計は [SPEC.md](./SPEC.md) を参照。

## アーキテクチャ

```
ユーザー ─► CloudFront ─► S3 (React SPA)
                │
                └─► API Gateway (HTTP API) ─► Lambda (Python) ─► DynamoDB
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

## ディレクトリ構成

```
frontend/   React + Vite + TS
backend/    Python Lambda (src/task_api) + tests
infra/      Terraform (modules/ と environments/{local,prod})
scripts/    ローカル運用スクリプト
.github/    CI/CD ワークフロー
```

## 必要なもの

- [mise](https://mise.jdx.dev/)（Node / Python / Terraform / pnpm / awscli を管理）
- Docker（LocalStack 用）

## セットアップ

```bash
mise install     # .mise.toml のツールを導入
make setup       # フロント/バックエンドの依存関係を導入
```

## ローカル開発（LocalStack）

本番と同じ Terraform 定義を LocalStack に適用して、AWS 相当の環境をローカルに構築する。

```bash
make local-up        # LocalStack を起動
make local-deploy    # Terraform apply → フロントビルド → S3 配信
```

デプロイ完了後、出力される Site URL / API URL でアクセスできる。
フロント単体の開発サーバは `cd frontend && pnpm dev`（`VITE_API_URL` で API を指定）。

停止:

```bash
make local-down
```

## テスト・検証

```bash
make test-backend    # pytest（moto で DynamoDB をモック）
make lint-backend    # ruff
make lint-frontend   # tsc 型チェック
make build-frontend  # フロントビルド
make tf-validate     # Terraform validate（local/prod）
```

## 本番デプロイ（AWS）

### 事前準備（初回のみ）

1. GitHub OIDC 用の IAM ロールを作成し、`main` からの引き受けを許可する。
2. リポジトリ設定の **Variables** に以下を登録:
   - `AWS_DEPLOY_ROLE_ARN`: 上記 IAM ロールの ARN
   - `FRONTEND_BUCKET_NAME`: フロント配信用 S3 バケット名（グローバル一意）
3. （推奨）Terraform ステートの S3 バックエンドを用意し、
   `infra/environments/prod/backend.tf.example` を有効化する。

### デプロイ

`main` への push で [.github/workflows/deploy.yml](.github/workflows/deploy.yml) が起動し、
以下を自動実行する。

1. `terraform apply`（Lambda コードは zip ハッシュ変化で自動更新）
2. フロントを本番 API 向けにビルド
3. S3 へ同期 + CloudFront キャッシュ無効化

手動デプロイは Actions の「Deploy (prod)」から `workflow_dispatch` でも可能。

## CI

Pull Request で [.github/workflows/ci.yml](.github/workflows/ci.yml) が起動し、
バックエンド（ruff + pytest）、フロント（型チェック + build）、Terraform（fmt + validate）を検証する。

## API 仕様

| メソッド | パス          | 説明     |
| -------- | ------------- | -------- |
| GET      | `/tasks`      | 一覧取得 |
| POST     | `/tasks`      | 作成     |
| GET      | `/tasks/{id}` | 単一取得 |
| PUT      | `/tasks/{id}` | 更新     |
| DELETE   | `/tasks/{id}` | 削除     |

## 本番とローカルの差分最小化

- `infra/modules/*` は prod/local 共通。差分は `environments/*` の変数と provider 設定に限定。
- バックエンドは `AWS_ENDPOINT_URL` があれば LocalStack、無ければ AWS を利用（コードは環境非依存）。
- CloudFront は LocalStack 非対応のため、`enable_cloudfront` 変数で prod のみ有効化し、
  ローカルは S3 ウェブサイトホスティングで代替する（差分はこの一点に集約）。

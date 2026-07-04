# 開発ガイド

ローカルでの開発・テスト手順をまとめる。設計の全体像は [../SPEC.md](../SPEC.md) を参照。

## 前提ツール

[mise](https://mise.jdx.dev/) でランタイムとツールのバージョンを固定している（[../.mise.toml](../.mise.toml)）。

| ツール    | バージョン | 用途                     |
| --------- | ---------- | ------------------------ |
| Node.js   | 22         | フロントエンド           |
| pnpm      | 9          | フロントの依存管理       |
| Python    | 3.13       | バックエンド (Lambda)    |
| Terraform | 1.10       | インフラ                 |
| awscli    | 2          | S3 配信・動作確認        |

加えて **Docker**（LocalStack 実行用）が必要。

## セットアップ

```bash
mise install     # .mise.toml のツールを導入
make setup       # フロント/バックエンドの依存関係を導入
```

`make setup` は次を行う。

- `mise install`
- `frontend`: `pnpm install`
- `backend`: venv 作成 + `pip install -e ".[dev]"`

## ディレクトリと責務

```
frontend/   React + Vite + TS。src/api.ts が API 呼び出し、src/App.tsx が UI。
backend/    タスクCRUD API の Python Lambda。src/task_api/ に handler / models / repository。
api/        タスク統計 API の Python Lambda。src/stats_api/ に handler / repository。
infra/      Terraform。modules/ は prod/local 共通、environments/ が環境差分。
scripts/    ローカル運用スクリプト（deploy-local.sh）。
```

## ローカル実行（LocalStack）

本番と同じ Terraform 定義を LocalStack に適用し、AWS 相当の環境をローカルに作る。
本番との差分最小化の考え方は [SPEC.md](../SPEC.md) と [deployment.md](./deployment.md) を参照。

```bash
make local-up        # LocalStack を起動（health チェック待機込み）
make local-deploy    # Terraform apply → フロントビルド → S3 配信
make local-down      # 停止
make local-logs      # LocalStack のログ
```

`make local-deploy`（[scripts/deploy-local.sh](../scripts/deploy-local.sh)）の流れは本番 CD と同一：

1. `infra/environments/local` に `terraform apply`
2. `terraform output` から API URL / バケット名を取得
3. `VITE_API_URL` を注入してフロントをビルド
4. `aws s3 sync` で LocalStack の S3 へ配信

完了後、出力される **Site URL / API URL** でアクセスできる。

### フロント単体の開発サーバ

UI だけを高速に反復したい場合は Vite の dev サーバを使う。

```bash
cd frontend
VITE_API_URL=<LocalStack の API URL> pnpm dev
```

## テストと静的検査

```bash
make test-backend    # タスクCRUD API の pytest（moto で DynamoDB をモック。ネットワーク不要）
make test-api        # 統計 API の pytest
make lint-backend    # ruff
make lint-frontend   # tsc --noEmit（型チェック）
make build-frontend  # vite build
make tf-validate     # terraform validate（local / prod）
```

これらは CI（[../.github/workflows/ci.yml](../.github/workflows/ci.yml)）と同じ検査。PR 前にローカルで通しておくと安全。

## 環境変数の扱い

アプリコードを環境非依存に保つため、接続先はすべて環境変数で注入する。

| 変数              | 対象     | 意味                                                     |
| ----------------- | -------- | -------------------------------------------------------- |
| `AWS_ENDPOINT_URL` | backend  | 設定時はその URL（LocalStack）へ、未設定なら通常の AWS へ |
| `TABLE_NAME`       | backend  | DynamoDB テーブル名                                      |
| `VITE_API_URL`     | frontend | API のベース URL（ビルド時に埋め込み）                   |

## よくあるつまずき

- **`make local-deploy` が API に繋がらない**: `make local-up` で LocalStack が
  起動しているか、`curl http://localhost:4566/_localstack/health` で確認。
- **Lambda から DynamoDB に繋がらない**: LocalStack の Lambda コンテナが
  `http://localstack:4566` へ到達できる必要がある。`docker-compose.yml` の
  `LAMBDA_DOCKER_NETWORK` が compose のネットワーク名と一致しているか確認。
- **AWS のダミー認証情報の混在**: ローカルは `test`/`test` を使う。実 AWS を触るときは
  `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL` してから
  SSO プロファイルを使う（[deployment.md](./deployment.md) 参照）。

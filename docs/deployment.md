# デプロイ / CI・CD ガイド

本番（AWS）へのデプロイと CI/CD の仕組み、運用手順をまとめる。

## 全体像

```
PR 作成/更新        →  ci.yml            検証（lint / test / validate）
main へ push        →  deploy.yml        本番デプロイ（CD）
main へ push        →  release-please.yml リリース自動化（別系統）
```

認証は AWS の長期アクセスキーを持たず、**GitHub OIDC** で IAM ロールを引き受ける。

## CI — [.github/workflows/ci.yml](../.github/workflows/ci.yml)

**トリガー**: Pull Request、および main 以外への push。
**権限**: `contents: read` のみ。

3 ジョブを並列実行する。

| ジョブ      | 内容                                                             |
| ----------- | --------------------------------------------------------------- |
| `backend`   | Python 3.13 → `ruff check` → `pytest`                            |
| `frontend`  | pnpm + Node 22 → `pnpm install --frozen-lockfile` → `lint` → `build` |
| `terraform` | `terraform fmt -check` → prod で `init -backend=false` + `validate` |

## CD — [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)

**トリガー**: `main` への push、および手動実行（`workflow_dispatch`）。
**権限**: `id-token: write`（OIDC）+ `contents: read`。
**その他**: `concurrency: deploy-prod` で同時実行を抑止、`environment: production`。

ステップ:

1. **AWS 認証 (OIDC)** — `configure-aws-credentials` に `vars.AWS_DEPLOY_ROLE_ARN` を渡す
2. **Terraform apply** — `infra/environments/prod`。`frontend_bucket_name` は
   `vars.FRONTEND_BUCKET_NAME` で注入。Lambda コードは zip ハッシュ変化で自動更新
3. **出力取得** — API URL / S3 バケット / CloudFront ID を `$GITHUB_OUTPUT` へ
4. **フロントビルド** — 取得した API URL を `VITE_API_URL` に入れて `pnpm build`
5. **配信** — `aws s3 sync` → `aws cloudfront create-invalidation`

> セキュリティ: Terraform 出力は `run:` に直接展開せず、`env:` 経由で参照する
> （コマンドインジェクション対策）。

## OIDC 認証基盤 — [infra/bootstrap](../infra/bootstrap/)

CD がキーレスで動くための土台。**初回に一度だけ** apply する。詳細は
[infra/bootstrap/README.md](../infra/bootstrap/README.md)。

作成物:

- GitHub OIDC プロバイダ（既存があれば `-var="create_oidc_provider=false"` で再利用）
- IAM ロール `taskapp-github-deploy` — 信頼ポリシーで `sub` を当リポジトリの
  `main`（environment: production）に限定
- デプロイ権限ポリシー（`iam:PassRole` は Lambda 実行ロールにスコープ）

### 実 AWS への認証（SSO）

長期キーは使わず、AWS IAM Identity Center（SSO）で短時間認証情報を得る。

```bash
aws sso login --profile <workload プロファイル>
aws sts get-caller-identity --profile <workload プロファイル>   # 対象アカウント確認
```

`terraform apply` は `AWS_PROFILE=<profile>` を付けて実行する。ダミー認証情報が
残っている場合は先に `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL`。

## 初回セットアップ手順

```bash
# 1) OIDC ロールを作成
cd infra/bootstrap
terraform init
terraform apply -var="create_oidc_provider=false"   # 既存プロバイダを再利用する場合

# 2) リポジトリ変数を登録
gh variable set AWS_DEPLOY_ROLE_ARN --repo <owner>/<repo> \
  --body "$(terraform output -raw deploy_role_arn)"
gh variable set FRONTEND_BUCKET_NAME --repo <owner>/<repo> \
  --body "taskapp-prod-frontend-<一意な値>"
```

## デプロイの実行

- **自動**: `main` へ push すると `deploy.yml` が起動。
- **手動**: Actions → 「Deploy (prod)」→ Run workflow、または
  `gh workflow run "Deploy (prod)" --ref main`。

### デプロイ後の確認

Terraform 出力（CI ランナー上）に URL が出る。ローカルからは AWS に問い合わせて確認できる。

```bash
export AWS_PROFILE=<profile>
# API エンドポイント
aws apigatewayv2 get-apis \
  --query "Items[?Name=='taskapp-prod-task-api'].ApiEndpoint" --output text
# サイト（CloudFront）
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='<バケット名>'].DomainName" --output text
```

## ⚠️ 既知の課題：Terraform ステートが永続化されていない

`environments/prod` は現在 **ローカルバックエンド**で動作している。CI ランナーは使い捨てのため、
**apply 後にステートが破棄される**。結果として:

- **初回デプロイは成功する**が、
- **2 回目以降は空のステートから全リソースを再作成しようとし、既存リソースと衝突して失敗する**
  （DynamoDB テーブルや IAM ロールの「already exists」エラー）。

### 対応（リモートステートへ移行）

繰り返しデプロイするには S3 リモートステート + DynamoDB ロックが必須。
雛形は [infra/environments/prod/backend.tf.example](../infra/environments/prod/backend.tf.example)。

移行方法は 2 通り:

- **A案（クリーン）**: 既存 prod リソースを削除 → `backend.tf` を有効化 → CD 再実行で
  最初から永続ステートで作り直す（テストデータのみなら損失なし）。
- **B案（無停止）**: `backend.tf` を有効化 → 既存リソースを `terraform import` で新ステートに
  取り込む（衝突なく継続。リソースごとに import 作業が必要）。

事前に state 用の S3 バケットと DynamoDB ロックテーブルを用意しておくこと。

## リリース自動化との関係

[release-please.yml](../.github/workflows/release-please.yml) はコンベンショナルコミットから
リリース PR を自動生成し、その PR のマージでタグ付け＋GitHub Release を公開する（デプロイとは独立）。

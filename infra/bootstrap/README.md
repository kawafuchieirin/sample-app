# bootstrap — GitHub OIDC デプロイ用 IAM

GitHub Actions（`deploy.yml`）が **長期アクセスキーなし**で AWS にデプロイできるよう、
GitHub OIDC プロバイダとデプロイ用 IAM ロールを作成する Terraform。

本体インフラ（`environments/prod`）とはステートを分離しており、**初回に一度だけ** apply する。

## 作成されるもの

- `aws_iam_openid_connect_provider`: `token.actions.githubusercontent.com`
- `aws_iam_role`: このリポジトリの `main`（environment: production）からのみ
  引き受け可能なデプロイ用ロール
- 上記ロールへのデプロイ権限ポリシー

## 前提

- 管理者権限を持つ AWS 認証情報がローカルに設定されていること
  （`aws sts get-caller-identity` が成功する状態）

## 手順

```bash
cd infra/bootstrap
terraform init
terraform apply

# 出力されたロール ARN をリポジトリ変数に設定
gh variable set AWS_DEPLOY_ROLE_ARN --repo kawafuchieirin/sample-app \
  --body "$(terraform output -raw deploy_role_arn)"

# フロント配信バケット名（グローバル一意）も設定
gh variable set FRONTEND_BUCKET_NAME --repo kawafuchieirin/sample-app \
  --body "taskapp-prod-frontend-<一意な値>"
```

## 既に OIDC プロバイダが存在する場合

同一アカウントに `token.actions.githubusercontent.com` のプロバイダが既にある場合は、
重複作成を避けるため次のように既存を参照する。

```bash
terraform apply -var="create_oidc_provider=false"
```

## 対象リポジトリ・許可範囲の変更

- `github_repo`: OIDC を許可するリポジトリ（既定 `kawafuchieirin/sample-app`）
- `allowed_subjects`: 引き受けを許可する `sub` を明示指定（既定は main の
  environment: production と ref を許可）

## 権限の絞り込み

デプロイ権限は各サービスのワイルドカードを含む。運用が固まったらリソース ARN 単位で
さらに最小権限化できる。

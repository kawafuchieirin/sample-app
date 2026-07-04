#!/usr/bin/env bash
# LocalStack に対してインフラを適用し、フロントをビルドして配信するローカルデプロイ。
# 本番の CD と同じ流れ（Terraform apply → フロントビルド → S3 配信）をローカルで再現する。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="${REPO_ROOT}/infra/environments/local"
FRONTEND_DIR="${REPO_ROOT}/frontend"

# LocalStack 向けのダミー認証情報とエンドポイント
export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"
export AWS_DEFAULT_REGION="ap-northeast-1"
export AWS_ENDPOINT_URL="http://localhost:4566"

echo "==> LocalStack の起動を確認"
if ! curl -sf "http://localhost:4566/_localstack/health" >/dev/null; then
  echo "LocalStack が起動していません。'make local-up' で起動してください。" >&2
  exit 1
fi

echo "==> Terraform apply (local)"
cd "${ENV_DIR}"
terraform init -input=false >/dev/null
terraform apply -auto-approve -input=false

API_ENDPOINT="$(terraform output -raw api_endpoint)"
BUCKET="$(terraform output -raw frontend_bucket)"
SITE_URL="$(terraform output -raw site_url)"

echo "==> フロントエンドをビルド (VITE_API_URL=${API_ENDPOINT})"
cd "${FRONTEND_DIR}"
corepack pnpm install --frozen-lockfile
VITE_API_URL="${API_ENDPOINT}" corepack pnpm build

echo "==> S3 へ同期 (${BUCKET})"
aws --endpoint-url "${AWS_ENDPOINT_URL}" s3 sync ./dist "s3://${BUCKET}" --delete

echo ""
echo "デプロイ完了"
echo "  API : ${API_ENDPOINT}"
echo "  Site: ${SITE_URL}"

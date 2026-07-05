#!/usr/bin/env bash
# AI アシスタントの常駐ゲートウェイ(ai-gateway)をローカル起動する。
#
# Codex CLI とその認証(~/.codex)はホスト側にあるため、ゲートウェイもホストで動かす
# （コンテナ化しない）。TASK_API_URL は local デプロイ済みの API Gateway を Terraform
# 出力から取得する。未デプロイなら 'make local-deploy' を先に実行すること。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATEWAY_DIR="${REPO_ROOT}/ai-gateway"

# TASK_API_URL: 明示指定が無ければローカル API サーバ(make local-api)を指す。
# LocalStack Community は apigatewayv2 を扱えないため、local はこの dev サーバで /tasks を提供する。
LOCAL_API_PORT="${LOCAL_API_PORT:-8788}"
export TASK_API_URL="${TASK_API_URL:-http://127.0.0.1:${LOCAL_API_PORT}}"

# ローカル API サーバの疎通チェック（未起動なら案内して終了）。
if ! curl -sf "${TASK_API_URL}/tasks" >/dev/null 2>&1; then
  echo "タスク API (${TASK_API_URL}) に接続できません。" >&2
  echo "別ターミナルで 'make local-up'(LocalStack) と 'make local-api' を起動してください。" >&2
  echo "（本番 API 等を使う場合は TASK_API_URL=... を指定）" >&2
  exit 1
fi

# Codex の login 状態を軽くチェック
if [[ ! -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]]; then
  echo "警告: ${CODEX_HOME:-$HOME/.codex}/auth.json が見つかりません。'codex login' が必要かもしれません。" >&2
fi

echo "==> ai-gateway を起動 (TASK_API_URL=${TASK_API_URL})"
cd "${GATEWAY_DIR}"
corepack pnpm install --frozen-lockfile >/dev/null
exec corepack pnpm start

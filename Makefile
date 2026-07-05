.PHONY: help setup local-up local-down local-deploy local-api local-logs test test-backend lint-backend build-frontend lint-frontend tf-validate codex-schema ai-gateway-setup ai-gateway-test ai-gateway-smoke ai-gateway-chat ai-up

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## ランタイムと依存関係をインストール
	mise install
	cd frontend && corepack pnpm install
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
	cd api && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"

local-up: ## LocalStack を起動
	docker compose up -d
	@echo "LocalStack のヘルスチェックを待機中..."
	@until curl -sf http://localhost:4566/_localstack/health >/dev/null; do sleep 1; done
	@echo "LocalStack 起動完了"

local-down: ## LocalStack を停止
	docker compose down

local-logs: ## LocalStack のログを表示
	docker compose logs -f localstack

local-deploy: ## LocalStack へインフラ+フロントをデプロイ
	./scripts/deploy-local.sh

local-api: ## ローカル用タスク API サーバを起動（LocalStack Community 向け・既存ハンドラ再利用）
	cd backend && . .venv/bin/activate && python ../scripts/local_api_server.py

test: test-backend test-api ## すべてのテストを実行

test-backend: ## バックエンドのテスト (pytest)
	cd backend && . .venv/bin/activate && pytest -q

test-api: ## 統計API のテスト (pytest)
	cd api && . .venv/bin/activate && pytest -q

lint-backend: ## バックエンドの Lint (ruff)
	cd backend && . .venv/bin/activate && ruff check src tests

lint-api: ## 統計API の Lint (ruff)
	cd api && . .venv/bin/activate && ruff check src tests

build-frontend: ## フロントエンドのビルド
	cd frontend && corepack pnpm build

lint-frontend: ## フロントエンドの型チェック
	cd frontend && corepack pnpm lint

tf-validate: ## Terraform の検証
	cd infra/environments/local && terraform init -backend=false >/dev/null && terraform validate
	cd infra/environments/prod && terraform init -backend=false >/dev/null && terraform validate

codex-schema: ## Codex app-server の実プロトコルから TS 型を再生成（フィールドずれ対策の正）
	cd ai-gateway && corepack pnpm gen:types
	@echo "生成完了: ai-gateway/src/generated/ (git 管理下・手動編集禁止)"

ai-gateway-setup: ## ai-gateway の依存をインストール
	cd ai-gateway && corepack pnpm install

ai-gateway-test: ## ai-gateway の型チェック + ユニットテスト（Codex 不要）
	cd ai-gateway && corepack pnpm lint && corepack pnpm test

ai-gateway-smoke: ## Codex app-server との最小疎通を確認（initialize→thread/start→turn/start）
	cd ai-gateway && corepack pnpm smoke

ai-gateway-chat: ## ローカルで Codex と対話する CLI（ブラウザ UI 前の試用）
	cd ai-gateway && corepack pnpm chat

ai-up: ## AI アシスタントのゲートウェイを起動（TASK_API_URL は local デプロイから自動取得）
	./scripts/run-ai-gateway.sh

.PHONY: help setup local-up local-down local-deploy local-logs test test-backend lint-backend build-frontend lint-frontend tf-validate

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

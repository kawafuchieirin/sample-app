# ai-gateway

Codex app-server とブラウザを仲介する常駐ゲートウェイ（AI タスクアシスタント）。
自然言語の指示を Codex が解釈し、MCP 経由で既存のタスク API（`/tasks`）を操作する。
設計の全体像は [../docs/ai-assist-spec.md](../docs/ai-assist-spec.md) を参照。

```
ブラウザ(React AIパネル) ⇄ WebSocket ⇄ ai-gateway ⇄ JSON-RPC/stdio ⇄ codex app-server
                                          │                              │ MCP/stdio
                                          └── TASK_API_URL          mcpTaskServer ── /tasks(REST)
```

## 前提

- Codex CLI がインストールされ `codex login` 済み（認証は `~/.codex/auth.json`）。
- 動作確認時の Codex: **codex-cli 0.142.5**（プロトコル v2）。
- Node.js 22 / pnpm 9。

## セットアップ

```bash
cd ai-gateway && corepack pnpm install
```

## 起動（ブラウザから使う）

タスク API が動いている前提。リポジトリ直下で 3 つを別ターミナルで起動:

```bash
make local-up      # LocalStack(DynamoDB)
make local-api     # タスク API(dev サーバ) http://localhost:8788  ※Community 制約の回避
make ai-up         # ゲートウェイ（既定で TASK_API_URL=http://127.0.0.1:8788 を指す）

cd frontend && corepack pnpm dev   # dev は環境変数不要（/api を Vite が 8788 へプロキシ）
```

> LocalStack Community は apigatewayv2/新しい Lambda ランタイムを扱えないため、ローカルの
> `/tasks`・`/stats` は既存ハンドラを再利用する `make local-api`（`scripts/local_api_server.py`）が
> 提供する。別 API を使う場合は `TASK_API_URL=... make ai-up`。

フロントのタスク画面下部に「🤖 AI アシスタント」パネルが出る。
例:「牛乳を買うタスクを追加して」「進行中を全部完了にして」「〇〇を削除して」（削除は承認ダイアログ）。

## 承認方針

`approvalPolicy=on-request` のとき Codex は各 MCP ツール呼び出し前に承認を求める
（`mcpServer/elicitation/request` / `_meta.codex_approval_kind="mcp_tool_call"`）。
gateway がツール名で振り分ける:

- `list_tasks` / `create_task` / `update_task` → 自動許可（UI に実行を通知）
- `delete_task`（破壊的）→ ブラウザに承認ダイアログを出し、許可されたら実行

## 開発用コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm start` / `make ai-up` | WebSocket ゲートウェイ起動 |
| `pnpm chat` / `make ai-gateway-chat` | Codex と対話する CLI（UI 前の試用） |
| `pnpm smoke` | 最小疎通（initialize→thread→turn） |
| `pnpm smoke:mcp` | MCP 疎通（モック API に create/list） |
| `pnpm smoke:ws` | WS 全体（作成→一覧→削除承認）※実 Codex |
| `pnpm gen:types` / `make codex-schema` | Codex から型を再生成 |
| `pnpm test` / `pnpm lint` | ユニットテスト / 型チェック（Codex 不要） |

`smoke*` は実 Codex を使いサブスクを消費する。`test` は fake/mock で決定的。

## 型の生成（フィールドずれ対策）

`src/generated/` は Codex app-server の**実プロトコルから生成**した型で**手動編集禁止**
（`.gitattributes` で generated 扱い）。ドキュメントではなくこの生成物を「正」とする。
Codex 更新時は `make codex-schema` で再生成し、差分（例 `textDelta`→`delta`）をレビュー。

## 構成

```
src/
  codexClient.ts     # JSON-RPC 2.0 over stdio クライアント（プロセス注入可能）
  session.ts         # initialize→thread/start（MCP 設定注入）
  runTurn.ts         # 1 ターン実行 + ストリーム集約
  bridge.ts          # Codex⇄ブラウザ変換 + 承認振り分け（P5）
  server.ts          # WebSocket ゲートウェイ本体
  protocol.ts        # ブラウザ⇔gateway の WS 契約（フロントがミラー）
  taskClient.ts      # /tasks REST クライアント
  mcpTaskServer.ts   # Codex に接続する MCP stdio サーバ（4 ツール）
  taskMcpLauncher.ts # MCP サーバ起動設定の生成
  config.ts          # 環境変数
  devMockTaskApi.ts  # テスト/smoke 用インメモリ /tasks
  generated/         # Codex 生成型（手動編集禁止）
  smoke*.ts          # 各段階の疎通スクリプト
test/                # codexClient / taskClient / bridge のユニットテスト
```

## 環境変数

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `GATEWAY_HOST` | `127.0.0.1` | 待受ホスト（localhost 限定） |
| `GATEWAY_PORT` | `8787` | 待受ポート |
| `TASK_API_URL` | `http://localhost:4566` | タスク API のベース URL |
| `CODEX_BIN` | `codex` | Codex CLI パス |
| `CODEX_HOME` | `~/.codex` | 認証・設定の場所 |
| `CODEX_MODEL` | (Codex 既定) | 使用モデル |

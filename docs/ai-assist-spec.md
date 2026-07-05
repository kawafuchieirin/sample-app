# AI タスクアシスタント 設計書 (SPEC)

自然言語でタスクを操作できる AI アシスタントを、**Codex app-server** をエージェント基盤として
本アプリに組み込むための設計。参考記事「Codex app-server 完全ガイド」の手法を、本リポジトリの
構成（React SPA + AWS Lambda + DynamoDB / LocalStack）に合わせて再設計する。

> 出典記事: <https://note.com/masa_wunder/n/n53f45b621510>

> **実装状況（P1〜P6 完了）**: `ai-gateway/`（Node/TS）に実装済み。Codex `0.142.5` の
> **v2 プロトコル**で実 Codex を用いたエンドツーエンド疎通（作成→一覧→削除承認）を確認済み。
> 起動は `make ai-up` +（フロント）`VITE_AI_WS_URL=ws://127.0.0.1:8787 pnpm dev`。
> 記事は v1（`newConversation`）だが本実装は generate-ts の実型を正とする。

## 1. ゴール

- タスク一覧画面に「AI アシスタント」パネルを追加する。
- 「〇〇のタスクを作って」「進行中のタスクを全部完了にして」等の自然言語指示を、
  Codex が理解し、既存のタスク CRUD API を呼び出して実行する。
- 応答はストリーミング表示し、削除など破壊的操作は UI 上の**承認**を挟む。

## 2. 前提と制約（重要）

このリポジトリの本体はサーバーレス（Lambda・ステートレス）だが、Codex app-server は
**永続的な子プロセスに stdio/WS で繋ぎ続ける**モデルであり、そのままは Lambda に載らない。
また認証は **OS ユーザー単位**（`~/.codex/auth.json`）で、app-server 層に「誰のリクエストか」を
識別する機構はない。したがって本機能は次の範囲で設計する。

- **ローカル単一運用者**をまず対象とする。docker-compose に常駐ゲートウェイを追加し、
  運用者自身の ChatGPT サブスク（`~/.codex`）で動かす。マルチユーザー公開は将来課題（§13）。
- **プロトコルは v2 を正とする。** 手元の Codex `0.142.5` は記事中の v1
  （`newConversation` / `sendUserMessage`）ではなく **v2**（`thread/start` / `turn/start`）を使う。
  記事が警告する「フィールドずれ」対策として、ドキュメントではなく
  `codex app-server generate-json-schema --out <dir>` の**実スキーマを正**とし、そこから
  TypeScript 型を生成する（`codex app-server generate-ts` も利用可）。

## 3. アーキテクチャ

```
                     ┌──────────────────────── ブラウザ (React SPA) ───────────────────────┐
                     │  タスク一覧  +  AI アシスタントパネル (chat UI / 承認ダイアログ)      │
                     └───────────────┬───────────────────────────────┬────────────────────┘
                                     │ WebSocket (chat/stream/approve) │ REST /tasks /stats
                                     ▼                                 ▼
        ┌──────────────── ai-gateway (Node/TS, 常駐) ─────────────┐    API Gateway → Lambda
        │  ・ブラウザ WS ⇄ Codex JSON-RPC の双方向中継            │      (task_api / stats_api)
        │  ・thread/turn 管理、通知→WS 変換、承認往復             │            │
        │  ・MCP task server を Codex に接続                       │         DynamoDB
        └───────┬──────────────────────────────┬──────────────────┘
                │ JSON-RPC 2.0 over stdio        │ MCP (stdio)
                ▼                                ▼
       codex app-server (子プロセス)     mcp-task-server (Node/TS)
       ~/.codex/auth.json で認証          → 内部で /tasks REST を呼ぶ
```

- **ai-gateway**: 新規 `ai-gateway/`。Codex app-server を子プロセスとして spawn し、
  ブラウザとの WebSocket を張る中継役。
- **mcp-task-server**: Codex から「道具」として見える MCP サーバ。`create_task` /
  `list_tasks` / `update_task` / `delete_task` を提供し、内部で既存の `/tasks` REST を叩く。
  これにより Codex にファイルシステムや shell を触らせず、**タスク API だけを能力として渡す**。

## 4. Codex app-server プロトコル (v2) — 実スキーマ由来

`generate-json-schema` で確認した、本機能で使う最小サブセット。

### クライアント→サーバ Request
| メソッド | 用途 |
| --- | --- |
| `initialize` | ハンドシェイク（最初に必須） |
| `thread/start` | 会話スレッド開始。`approvalPolicy` / `sandbox` / `cwd` / `config`(MCP設定) 等を指定 |
| `turn/start` | ユーザー発話の送信。`{ threadId, input: UserInput[] }`。`input` は `{type:"text", text}` 等 |
| `turn/interrupt` | 実行中ターンの中断 |

### クライアント→サーバ Notification
| メソッド | 用途 |
| --- | --- |
| `initialized` | `initialize` 応答後に送る |

### サーバ→クライアント Notification（ストリーム）
| メソッド | 用途 |
| --- | --- |
| `turn/started` / `turn/completed` | ターンの開始・終了 |
| `item/started` / `item/completed` | アイテム（アシスタント発話・ツール呼び出し等）の開始・完了 |
| （item 内の delta 系） | アシスタント本文の逐次追記。**`textDelta` ではなく `delta`**（記事の既知ずれ） |

### サーバ→クライアント Request（承認・要求）
| メソッド | 用途 |
| --- | --- |
| `item/commandExecution/requestApproval` | コマンド実行の承認要求 |
| `item/fileChange/requestApproval` | ファイル変更の承認要求 |
| `item/permissions/requestApproval` | 権限の承認要求 |
| `item/tool/requestUserInput` | ツールからのユーザー入力要求 |
| `mcpServer/elicitation/request` | MCP サーバからの入力要求 |

`UserInput` は `oneOf`（`text` / `image` …）。本機能では `text` のみ使用。

## 5. ブラウザ ⇔ ai-gateway の WS プロトコル（独自・薄い）

Codex の生 JSON-RPC をそのまま流さず、UI に必要な形へ変換した薄い契約にする。

```jsonc
// クライアント → gateway
{ "type": "user_message", "text": "買い物のタスクを作って" }
{ "type": "approval_response", "id": "<reqId>", "decision": "approved" | "denied" }
{ "type": "interrupt" }

// gateway → クライアント
{ "type": "assistant_delta", "text": "作成します…" }   // item delta の中継
{ "type": "tool_call", "name": "create_task", "args": {...}, "status": "started"|"completed" }
{ "type": "approval_request", "id": "<reqId>", "kind": "...", "detail": {...} }
{ "type": "turn_completed" }
{ "type": "error", "message": "..." }
```

- 型は `frontend/src/types.ts` と gateway で共有する（`ai-gateway/src/protocol.ts` を単一の
  信頼できる情報源にし、フロントから import する）。

## 6. タスク操作の連携方式（MCP）

- Codex には shell/FS を与えず、`sandbox: read-only`＋MCP の task ツールのみを能力とする。
- `thread/start` の `config` で MCP サーバを宣言（`~/.codex/config.toml` の `mcp_servers` 相当を
  リクエスト時に注入）。mcp-task-server は環境変数 `TASK_API_URL` 経由で `/tasks` を呼ぶため、
  ローカルでは LocalStack、将来は本番 API を指すだけで切り替わる。
- ツール定義（JSON Schema）: `create_task(title, description?, status?)` /
  `list_tasks()` / `update_task(id, {title?,description?,status?})` / `delete_task(id)`。

## 7. 承認フロー（実装で判明した実態を反映）

- `thread/start` は `approvalPolicy: "on-request"` とする。
- **Codex はこの設定のとき、各 MCP ツール呼び出しの前に** サーバ→クライアント Request
  `mcpServer/elicitation/request`（`_meta.codex_approval_kind = "mcp_tool_call"`、
  `_meta.tool_params` 付き）で承認を求める。これが承認の実チャネル。
- gateway はツール名（承認メッセージ `run tool "..."` から抽出）で振り分ける:
  - `list_tasks` / `create_task` / `update_task` → **自動許可**（`{action:"accept"}`）し、
    UI へ `tool_activity` を通知。
  - `delete_task`（破壊的）→ `approval_request` に変換して UI にダイアログ表示 →
    ユーザーの許可/拒否を `approval_response` で受け、`{action:"accept"|"decline"}` を返す。
- 承認待ちは gateway 内の `pendingApprovals` map で保持し、WS 切断時は全て拒否扱いで drain。
  Codex の pending も TransportClosed 時に全 drain（`codexClient`）。
- 補足: モデルは破壊的操作の前に自然言語で再確認することがある（ツール未呼び出し）。
  その場合は承認ダイアログは出ず、次ターンで実際に `delete_task` を呼んだ時に発火する。

## 8. 設定・環境変数

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `CODEX_BIN` | `codex` | Codex CLI パス |
| `CODEX_HOME` | `~/.codex` | 認証・設定の場所（コンテナへ read-only マウント） |
| `CODEX_MODEL` | `gpt-5-codex` 等 | 使用モデル |
| `TASK_API_URL` | `http://localhost:4566/.../tasks`（local） | MCP から叩くタスク API |
| `GATEWAY_PORT` | `8787` | ブラウザ WS の待受ポート |
| `VITE_AI_WS_URL` | `ws://127.0.0.1:8787` | フロントの接続先 |

## 9. セキュリティ

- `auth.json` はコンテナに **read-only** マウントし、イメージやログに焼き込まない。
- Codex は `sandbox: read-only`＋MCP task ツールのみ。shell/FS/画像生成は無効化。
- gateway は `localhost` のみ待受（`0.0.0.0` 公開しない）。将来のホスティングは §13。
- 全外部入力（WS メッセージ）を型検証し、未知メッセージは破棄。

## 10. ディレクトリ構成（実装済み）

```
ai-gateway/                 # Node/TS 常駐ゲートウェイ
  src/
    server.ts               # WS サーバ + ライフサイクル（startGateway）
    codexClient.ts          # app-server spawn / JSON-RPC framing(改行区切り) / pending map
    session.ts              # initialize→thread/start（MCP 設定注入）
    runTurn.ts              # 1 ターン実行 + ストリーム集約
    bridge.ts               # Codex 通知 ⇄ WS メッセージ変換、承認振り分け
    protocol.ts             # ブラウザ⇔gateway WS 契約の型（信頼できる情報源）
    taskClient.ts           # /tasks REST クライアント
    mcpTaskServer.ts        # MCP task ツール（内部で /tasks REST を呼ぶ）
    taskMcpLauncher.ts      # MCP サーバ起動設定の生成
    config.ts / devMockTaskApi.ts / generated/ / smoke*.ts
  test/                     # codexClient / taskClient / bridge のユニットテスト
frontend/src/ai/
  AssistantPanel.tsx        # チャット UI
  useAssistant.ts           # WS フック（再接続・ストリーム集約）
  ApprovalDialog.tsx        # 承認ダイアログ
  protocol.ts               # gateway protocol のミラー
scripts/run-ai-gateway.sh   # ホスト起動（TASK_API_URL を Terraform 出力から取得）
docs/ai-assist-spec.md      # 本ファイル
```

> **デプロイ形態の判断**: Codex CLI と認証(`~/.codex`)はホストに紐づくため、ゲートウェイは
> **コンテナ化せずホストで実行**する（`make ai-up`）。docker-compose は LocalStack 専用のまま。
> マルチユーザー/コンテナ化は §13 の将来課題。

> **ローカル API（LocalStack Community 制約の回避）**: 本アプリの API は apigatewayv2(HTTP API)
> と Lambda(python3.13) を使うが、どちらも LocalStack Community では動かない（前者は Pro 機能、
> 後者は python3.12 まで）。そこでローカルは本番と同じ Python ハンドラ(`task_api`/`stats_api`)を
> 再利用する軽量 HTTP サーバ `make local-api`（`scripts/local_api_server.py`, 既定 :8788）で
> `/tasks`・`/stats` を提供し、DynamoDB は LocalStack を使う。gateway の `TASK_API_URL` と
> フロントの `VITE_API_URL` はこれを指す。本番は従来どおり Terraform で API Gateway+Lambda。

## 11. テスト方針

- **codexClient**: JSON-RPC フレーミング（1行=1メッセージ）、pending map の解決、
  TransportClosed 時の全 drain を、疑似 stdio ストリームでユニットテスト。
- **bridge**: Codex 通知（`item/*`, `turn/*`, `*requestApproval`）→ WS メッセージ変換を
  スキーマ由来のフィクスチャで検証。`delta` フィールド名ずれの回帰テストを入れる。
- **mcp-task-server**: 各ツールが `/tasks` を正しく呼ぶことを、API をモックして検証。
- Codex 本体は起動せず、`codexClient` を差し替え可能にして決定的・高速に保つ。
- 型生成の自動追随: CI で `generate-json-schema` を実行し、生成型と差分が出たら fail。

## 12. 実装ステップ（すべて完了）

1. ✅ **P1 スキーマ→型**: `make codex-schema`（generate-ts）で `src/generated/` を生成。
2. ✅ **P2 codexClient**: `initialize`→`thread/start`→`turn/start`→`turn/completed` 疎通
   （`pnpm smoke`）。
3. ✅ **P3 MCP task server**: 4 ツールを実装、Codex 経由で作成/一覧を確認（`pnpm smoke:mcp`）。
4. ✅ **P4 WS ブリッジ + フロント**: `server.ts`/`bridge.ts` と AssistantPanel でストリーム表示。
5. ✅ **P5 承認フロー**: `mcp_tool_call` 承認を tool 名で振り分け、削除は ApprovalDialog。
6. ✅ **P6 仕上げ**: `make ai-up` 起動、README/docs、CI（lint+test）、ユニットテスト。

全体疎通は `pnpm smoke:ws`（作成→一覧→削除承認）で確認。

## 13. 既知の制約・将来課題

- **マルチユーザー公開**: app-server は OS ユーザー単位認証のため、前段に認可層
  （Tailscale / mTLS / リバースプロキシ + セッション）と、ユーザーごとの `CODEX_HOME`
  分離が必要。BYO ChatGPT 配布（各ユーザーが `codex login`）モデルは別 SPEC で設計する。
- **コスト**: 推論はサブスク経由（公式クライアント扱い）。画像生成は本機能では無効化。
- **プロトコル追随**: Codex はバージョンで v1→v2 のようにフィールドが動く。型生成の
  CI ゲート（§11）で検知する。
</content>
</invoke>

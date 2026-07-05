// 1 つのブラウザ接続に対応するセッションブリッジ。
// CodexClient（1 スレッド）とブラウザ WebSocket の間で、通知のストリーム変換と
// 承認（MCP tool_call）の往復を仲介する。
//
// 承認方針: Codex は approvalPolicy=on-request のとき各 MCP ツール呼び出し前に
// mcpServer/elicitation/request（_meta.codex_approval_kind="mcp_tool_call"）を送る。
//   - 読み取り/作成/更新（list_tasks/create_task/update_task）: 自動許可（tool_activity 通知）
//   - 破壊的操作（delete_task）: ブラウザへ approval_request を送り、応答を待つ

import type { CodexClient } from "./codexClient.js";
import { runTurn } from "./runTurn.js";
import { startThread, type McpServerConfig } from "./session.js";
import type { ApprovalDecision, ClientMessage, ServerMessage } from "./protocol.js";

/** 自動許可するツール（非破壊）。これ以外の tool_call はユーザー承認を求める。 */
const AUTO_APPROVE_TOOLS = new Set(["list_tasks", "create_task", "update_task"]);

export interface BridgeOptions {
  model?: string;
  mcpServers?: Record<string, McpServerConfig>;
  /** ブラウザへ送る関数。 */
  send: (message: ServerMessage) => void;
}

export class SessionBridge {
  private threadId: string | null = null;
  private busy = false;
  private closed = false;
  private approvalSeq = 0;
  private readonly pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>();

  constructor(
    private readonly client: CodexClient,
    private readonly options: BridgeOptions,
  ) {}

  /** ハンドシェイク → thread/start を行い、承認ハンドラを設定して ready を通知する。 */
  async init(): Promise<void> {
    this.client.setServerRequestHandler((method, params) => this.handleServerRequest(method, params));

    const started = await startThread(this.client, {
      clientName: "ai-gateway-web",
      model: this.options.model,
      mcpServers: this.options.mcpServers,
    });
    this.threadId = started.threadId;
    this.send({ type: "ready", threadId: started.threadId, model: started.model });
  }

  /** ブラウザからのメッセージを処理する。 */
  async handleClientMessage(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "user_message":
        await this.runUserTurn(msg.text);
        break;
      case "approval_response": {
        const resolve = this.pendingApprovals.get(msg.id);
        if (resolve) {
          this.pendingApprovals.delete(msg.id);
          resolve(msg.decision);
        }
        break;
      }
      case "interrupt":
        if (this.threadId) {
          this.client.request("turn/interrupt", { threadId: this.threadId }).catch(() => {});
        }
        break;
    }
  }

  close(): void {
    this.closed = true;
    // 未応答の承認は拒否扱いで解放する。
    for (const [, resolve] of this.pendingApprovals) resolve("denied");
    this.pendingApprovals.clear();
    this.client.stop();
  }

  // --- 内部 -----------------------------------------------------------------

  private send(message: ServerMessage): void {
    if (!this.closed) this.options.send(message);
  }

  private async runUserTurn(text: string): Promise<void> {
    if (!this.threadId) {
      this.send({ type: "error", message: "セッションが未初期化です" });
      return;
    }
    if (this.busy) {
      this.send({ type: "error", message: "前の応答を処理中です。完了までお待ちください。" });
      return;
    }
    this.busy = true;
    try {
      await runTurn(this.client, this.threadId, text, {
        onDelta: (delta) => this.send({ type: "assistant_delta", text: delta }),
      });
      this.send({ type: "turn_completed" });
    } catch (err) {
      this.send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      this.busy = false;
    }
  }

  /** Codex からのサーバリクエスト（主に承認）を処理する。 */
  private async handleServerRequest(method: string, params: unknown): Promise<unknown> {
    if (method === "mcpServer/elicitation/request") {
      const p = (params ?? {}) as {
        message?: string;
        _meta?: { codex_approval_kind?: string; tool_params?: unknown };
      };
      if (p._meta?.codex_approval_kind === "mcp_tool_call") {
        return this.handleToolApproval(p.message ?? "", p._meta.tool_params);
      }
      // その他の elicitation（フォーム入力要求など）は現状未対応 → 拒否。
      return { action: "decline" };
    }
    // コマンド実行・ファイル変更などの承認要求は read-only 構成では発生しない想定。
    // 安全側に倒して拒否する。
    return { action: "decline", decision: "denied" };
  }

  /** MCP tool_call の承認。読み取り/作成/更新は自動許可、削除はブラウザへ確認。 */
  private async handleToolApproval(message: string, toolParams: unknown): Promise<{ action: string }> {
    const tool = extractToolName(message);

    if (tool && AUTO_APPROVE_TOOLS.has(tool)) {
      this.send({ type: "tool_activity", tool, params: toolParams, auto: true });
      return { action: "accept" };
    }

    // 破壊的（delete_task 等）: ブラウザに承認を求めて待つ。
    const id = `apr_${++this.approvalSeq}`;
    const decision = await new Promise<ApprovalDecision>((resolve) => {
      this.pendingApprovals.set(id, resolve);
      this.send({
        type: "approval_request",
        id,
        tool: tool ?? "(unknown)",
        message,
        params: toolParams,
      });
    });
    return { action: decision === "approved" ? "accept" : "decline" };
  }
}

/** 承認メッセージ（例: `run tool "delete_task"`）からツール名を取り出す。 */
export function extractToolName(message: string): string | null {
  const m = message.match(/run tool "([^"]+)"/);
  return m ? m[1] : null;
}

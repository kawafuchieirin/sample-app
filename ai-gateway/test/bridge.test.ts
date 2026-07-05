// SessionBridge のユニットテスト。実 Codex は使わず、fake クライアントで
// ストリーム変換と承認振り分け（自動許可 / 削除はブラウザ確認）を検証する。

import { describe, expect, it } from "vitest";
import { SessionBridge, extractToolName } from "../src/bridge.js";
import type { CodexClient, NotificationListener, ServerRequestHandler } from "../src/codexClient.js";
import type { ServerMessage } from "../src/protocol.js";

/** bridge が使う CodexClient のメソッドだけを備えた fake。 */
class FakeClient {
  private listeners = new Set<NotificationListener>();
  private serverRequestHandler: ServerRequestHandler | null = null;
  readonly requests: Array<{ method: string; params: unknown }> = [];

  setServerRequestHandler(h: ServerRequestHandler | null): void {
    this.serverRequestHandler = h;
  }
  onNotification(l: NotificationListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  notify(): void {}
  stop(): void {}

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.requests.push({ method, params });
    if (method === "initialize") return Promise.resolve({ codexHome: "/x", platformOs: "macos" } as T);
    if (method === "thread/start") return Promise.resolve({ thread: { id: "t1" }, model: "gpt-test" } as T);
    return Promise.resolve({} as T);
  }

  // --- テスト駆動用 ---
  emit(method: string, params: unknown): void {
    for (const l of this.listeners) l(method, params);
  }
  invokeServerRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.serverRequestHandler) throw new Error("no handler");
    return Promise.resolve(this.serverRequestHandler(method, params));
  }
}

function setup() {
  const fake = new FakeClient();
  const sent: ServerMessage[] = [];
  const bridge = new SessionBridge(fake as unknown as CodexClient, {
    send: (m) => sent.push(m),
    mcpServers: { task: { command: "x" } },
  });
  return { fake, sent, bridge };
}

const tick = () => new Promise((r) => setImmediate(r));

function toolApprovalParams(toolName: string, toolParams: unknown = {}) {
  return {
    message: `Allow the task MCP server to run tool "${toolName}"?`,
    _meta: { codex_approval_kind: "mcp_tool_call", tool_params: toolParams },
  };
}

describe("extractToolName", () => {
  it("承認メッセージからツール名を抽出する", () => {
    expect(extractToolName('Allow ... run tool "delete_task"?')).toBe("delete_task");
    expect(extractToolName("no tool here")).toBeNull();
  });
});

describe("SessionBridge", () => {
  it("init で thread/start し ready を送る", async () => {
    const { fake, sent, bridge } = setup();
    await bridge.init();
    expect(fake.requests.map((r) => r.method)).toEqual(["initialize", "thread/start"]);
    expect(sent).toContainEqual({ type: "ready", threadId: "t1", model: "gpt-test" });
  });

  it("user_message でターンを実行し、delta と turn_completed を送る", async () => {
    const { fake, sent, bridge } = setup();
    await bridge.init();

    const turn = bridge.handleClientMessage({ type: "user_message", text: "やあ" });
    await tick();
    expect(fake.requests.some((r) => r.method === "turn/start")).toBe(true);

    fake.emit("item/agentMessage/delta", { delta: "こん" });
    fake.emit("item/agentMessage/delta", { delta: "にちは" });
    fake.emit("turn/completed", {});
    await turn;

    expect(sent).toContainEqual({ type: "assistant_delta", text: "こん" });
    expect(sent).toContainEqual({ type: "assistant_delta", text: "にちは" });
    expect(sent).toContainEqual({ type: "turn_completed" });
  });

  it("list_tasks の承認は自動許可し tool_activity を送る", async () => {
    const { fake, sent, bridge } = setup();
    await bridge.init();

    const result = await fake.invokeServerRequest(
      "mcpServer/elicitation/request",
      toolApprovalParams("list_tasks"),
    );
    expect(result).toEqual({ action: "accept" });
    expect(sent).toContainEqual({ type: "tool_activity", tool: "list_tasks", params: {}, auto: true });
  });

  it("delete_task はブラウザ承認を待ち、approved なら accept を返す", async () => {
    const { fake, sent, bridge } = setup();
    await bridge.init();

    const resultPromise = fake.invokeServerRequest(
      "mcpServer/elicitation/request",
      toolApprovalParams("delete_task", { id: "abc" }),
    );
    await tick();

    const approval = sent.find((m) => m.type === "approval_request") as
      | Extract<ServerMessage, { type: "approval_request" }>
      | undefined;
    expect(approval).toBeDefined();
    expect(approval?.tool).toBe("delete_task");

    await bridge.handleClientMessage({ type: "approval_response", id: approval!.id, decision: "approved" });
    expect(await resultPromise).toEqual({ action: "accept" });
  });

  it("delete_task を denied にすると decline を返す", async () => {
    const { fake, bridge, sent } = setup();
    await bridge.init();

    const resultPromise = fake.invokeServerRequest(
      "mcpServer/elicitation/request",
      toolApprovalParams("delete_task", { id: "abc" }),
    );
    await tick();
    const approval = sent.find((m) => m.type === "approval_request") as
      | Extract<ServerMessage, { type: "approval_request" }>
      | undefined;

    await bridge.handleClientMessage({ type: "approval_response", id: approval!.id, decision: "denied" });
    expect(await resultPromise).toEqual({ action: "decline" });
  });
});

// ブラウザ ⇔ ai-gateway の WebSocket プロトコル（独自・薄い契約）。
// Codex の生 JSON-RPC はここで UI 向けに変換する。フロント (frontend) と
// gateway の双方がこの型を「単一の信頼できる情報源」として参照する。

/** ブラウザ → gateway */
export type ClientMessage =
  | { type: "user_message"; text: string }
  | { type: "approval_response"; id: string; decision: ApprovalDecision }
  | { type: "interrupt" };

export type ApprovalDecision = "approved" | "denied";

/** gateway → ブラウザ */
export type ServerMessage =
  | { type: "ready"; threadId: string; model: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_activity"; tool: string; params: unknown; auto: boolean }
  | { type: "approval_request"; id: string; tool: string; message: string; params: unknown }
  | { type: "turn_completed" }
  | { type: "error"; message: string };

/** ブラウザからのメッセージを検証してパースする。不正なら null。 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const msg = value as Record<string, unknown>;

  switch (msg.type) {
    case "user_message":
      return typeof msg.text === "string" ? { type: "user_message", text: msg.text } : null;
    case "approval_response":
      return typeof msg.id === "string" && (msg.decision === "approved" || msg.decision === "denied")
        ? { type: "approval_response", id: msg.id, decision: msg.decision }
        : null;
    case "interrupt":
      return { type: "interrupt" };
    default:
      return null;
  }
}

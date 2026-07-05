// ブラウザ ⇔ ai-gateway の WebSocket プロトコル型。
// 信頼できる情報源は ai-gateway/src/protocol.ts。ここはそのミラー（別パッケージのため複製）。
// 変更時は両方を合わせること。

export type ApprovalDecision = "approved" | "denied";

/** ブラウザ → gateway */
export type ClientMessage =
  | { type: "user_message"; text: string }
  | { type: "approval_response"; id: string; decision: ApprovalDecision }
  | { type: "interrupt" };

/** gateway → ブラウザ */
export type ServerMessage =
  | { type: "ready"; threadId: string; model: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_activity"; tool: string; params: unknown; auto: boolean }
  | { type: "approval_request"; id: string; tool: string; message: string; params: unknown }
  | { type: "turn_completed" }
  | { type: "error"; message: string };

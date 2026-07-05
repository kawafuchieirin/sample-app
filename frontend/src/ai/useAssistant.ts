import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovalDecision, ClientMessage, ServerMessage } from "./protocol";

// AI アシスタント用の WebSocket 接続先。ビルド時に VITE_AI_WS_URL で注入。
// 既定は IPv4 を明示する: ゲートウェイは 127.0.0.1 で待受するため、`localhost` が
// IPv6(::1) に解決されるブラウザ（Chrome 等）だと ws://localhost では接続拒否になる。
const WS_URL = import.meta.env.VITE_AI_WS_URL ?? "ws://127.0.0.1:8787";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

export interface PendingApproval {
  id: string;
  tool: string;
  message: string;
  params: unknown;
}

export type ConnectionState = "connecting" | "ready" | "closed";

export interface UseAssistant {
  connection: ConnectionState;
  model: string | null;
  messages: ChatMessage[];
  busy: boolean;
  pendingApproval: PendingApproval | null;
  error: string | null;
  sendMessage: (text: string) => void;
  respondApproval: (id: string, decision: ApprovalDecision) => void;
}

let idSeq = 0;
const nextId = () => `m${++idSeq}`;

/**
 * ai-gateway と WebSocket でつなぎ、チャット状態を管理するフック。
 * onActivity はツール実行やターン完了時（タスクが変化しうる時）に呼ばれる。
 */
export function useAssistant(onActivity?: () => void): UseAssistant {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [model, setModel] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null); // 生成中アシスタントメッセージの id
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  const appendToStreaming = useCallback((delta: string) => {
    setMessages((prev) => {
      const id = streamingIdRef.current;
      if (id === null) {
        // ターン最初の delta: アシスタントメッセージを作る
        const msg: ChatMessage = { id: nextId(), role: "assistant", text: delta };
        streamingIdRef.current = msg.id;
        return [...prev, msg];
      }
      return prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m));
    });
  }, []);

  const addSystem = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "system", text }]);
  }, []);

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "ready":
          setConnection("ready");
          setModel(msg.model);
          break;
        case "assistant_delta":
          appendToStreaming(msg.text);
          break;
        case "tool_activity":
          addSystem(`🔧 ${msg.tool} を実行`);
          onActivityRef.current?.();
          break;
        case "approval_request":
          setPendingApproval({ id: msg.id, tool: msg.tool, message: msg.message, params: msg.params });
          break;
        case "turn_completed":
          streamingIdRef.current = null;
          setBusy(false);
          onActivityRef.current?.();
          break;
        case "error":
          setError(msg.message);
          setBusy(false);
          break;
      }
    },
    [appendToStreaming, addSystem],
  );

  useEffect(() => {
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setConnection("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          handleServerMessage(JSON.parse(ev.data as string) as ServerMessage);
        } catch {
          // 不正なメッセージは無視
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnection("closed");
        setBusy(false);
        // 簡易再接続（3秒後）
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [handleServerMessage]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || connection !== "ready") return;
      setError(null);
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
      streamingIdRef.current = null;
      setBusy(true);
      send({ type: "user_message", text: trimmed });
    },
    [busy, connection, send],
  );

  const respondApproval = useCallback(
    (id: string, decision: ApprovalDecision) => {
      send({ type: "approval_response", id, decision });
      setPendingApproval(null);
      addSystem(decision === "approved" ? "✅ 操作を承認しました" : "🚫 操作を拒否しました");
    },
    [send, addSystem],
  );

  return { connection, model, messages, busy, pendingApproval, error, sendMessage, respondApproval };
}

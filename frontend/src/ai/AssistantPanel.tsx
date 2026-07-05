import { useEffect, useRef, useState } from "react";
import { useAssistant } from "./useAssistant";
import { ApprovalDialog } from "./ApprovalDialog";

interface Props {
  /** ツール実行やターン完了時（タスクが変化しうる時）にタスク一覧を再取得する。 */
  onTasksMayHaveChanged?: () => void;
}

const CONNECTION_LABEL = {
  connecting: "接続中…",
  ready: "接続済み",
  closed: "切断（再接続待ち）",
} as const;

/** タスク画面に組み込む AI アシスタントのチャットパネル。 */
export function AssistantPanel({ onTasksMayHaveChanged }: Props) {
  const { connection, model, messages, busy, pendingApproval, error, sendMessage, respondApproval } =
    useAssistant(onTasksMayHaveChanged);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // 新着メッセージで自動スクロール
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
    setInput("");
  };

  return (
    <section className="ai-panel" aria-label="AI アシスタント">
      <header className="ai-header">
        <span className="ai-title">🤖 AI アシスタント</span>
        <span className={`ai-status ai-status-${connection}`}>
          {CONNECTION_LABEL[connection]}
          {model ? ` (${model})` : ""}
        </span>
      </header>

      <div className="ai-log" ref={logRef}>
        {messages.length === 0 && (
          <p className="ai-hint">
            例:「牛乳を買うタスクを追加して」「進行中のタスクを全部完了にして」
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`ai-msg ai-msg-${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="ai-msg ai-msg-assistant ai-typing">…</div>}
      </div>

      {error && <p className="ai-error">{error}</p>}

      <form className="ai-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          placeholder={connection === "ready" ? "タスクの指示を入力…" : "接続待ち…"}
          onChange={(e) => setInput(e.target.value)}
          disabled={connection !== "ready" || busy}
          aria-label="AI への指示"
        />
        <button type="submit" disabled={connection !== "ready" || busy || !input.trim()}>
          送信
        </button>
      </form>

      {pendingApproval && <ApprovalDialog approval={pendingApproval} onRespond={respondApproval} />}
    </section>
  );
}

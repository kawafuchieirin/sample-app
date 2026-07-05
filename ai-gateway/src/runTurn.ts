// 1 ターン（ユーザー発話 → ストリーム受信 → turn/completed）を実行する共通ヘルパー。
// smoke（1 発）と chat（対話ループ）の双方から使う。
//
// turn/start を送り、item/agentMessage/delta を集約しつつ onDelta で逐次通知し、
// turn/completed で解決する。error 通知・タイムアウトでは reject。リスナーは必ず解除する。

import type { CodexClient } from "./codexClient.js";
import type { AgentMessageDeltaNotification } from "./generated/v2/AgentMessageDeltaNotification.js";
import type { TurnStartParams } from "./generated/v2/TurnStartParams.js";

export interface RunTurnOptions {
  /** アシスタント本文の差分を逐次受け取る（画面出力など）。 */
  onDelta?: (delta: string) => void;
  /** turn/completed 待機のタイムアウト（ミリ秒）。既定 120s。 */
  timeoutMs?: number;
}

/** 1 ターンを実行し、集約したアシスタント本文を返す。 */
export function runTurn(
  client: CodexClient,
  threadId: string,
  text: string,
  options: RunTurnOptions = {},
): Promise<string> {
  const { onDelta, timeoutMs = 120_000 } = options;

  return new Promise<string>((resolve, reject) => {
    let assistantText = "";

    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`turn/completed をタイムアウト待機で受信できませんでした (${timeoutMs}ms)`));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      unsubscribe();
      fn();
    };

    const unsubscribe = client.onNotification((method, params) => {
      switch (method) {
        case "item/agentMessage/delta": {
          const p = params as AgentMessageDeltaNotification;
          assistantText += p.delta;
          onDelta?.(p.delta);
          break;
        }
        case "turn/completed":
          finish(() => resolve(assistantText));
          break;
        case "error":
          finish(() => reject(new Error(`サーバ error 通知: ${JSON.stringify(params)}`)));
          break;
        default:
          break;
      }
    });

    const params: TurnStartParams = {
      threadId,
      input: [{ type: "text", text, text_elements: [] }],
    };
    client.request("turn/start", params).catch((err: unknown) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
  });
}

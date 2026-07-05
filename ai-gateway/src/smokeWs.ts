// P4/P5: WS ゲートウェイのエンドツーエンド疎通。
// モックタスク API + ゲートウェイをインプロセスで起動し、WebSocket クライアントとして
// user_message を送って、ストリーム受信・tool_activity・タスク作成・削除承認までを検証する。
//
// 実行: `pnpm smoke:ws`（実 Codex を使う）

import { WebSocket } from "ws";
import { startGateway } from "./server.js";
import { startMockTaskApi } from "./devMockTaskApi.js";
import { loadConfig } from "./config.js";
import type { ClientMessage, ServerMessage } from "./protocol.js";

function log(label: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.log(`[smoke:ws] ${label}${suffix}`);
}

async function main(): Promise<void> {
  const api = await startMockTaskApi();
  log("モックタスク API", { url: api.url });

  const gateway = await startGateway({
    ...loadConfig(),
    host: "127.0.0.1",
    port: 0, // 空きポート
    taskApiUrl: api.url,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${gateway.port}`);
  const send = (m: ClientMessage) => ws.send(JSON.stringify(m));

  // approval_request が来たら「承認」で応答する（削除確認の自動テスト用）。
  const events: ServerMessage[] = [];
  let assistant = "";

  /** 指定条件を満たすメッセージが来るまで待つ。 */
  function waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 120_000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for message")), timeoutMs);
      const check = (m: ServerMessage) => {
        if (pred(m)) {
          clearTimeout(timer);
          ws.off("message", onMsg);
          resolve(m);
        }
      };
      const onMsg = (data: import("ws").RawData) => {
        const m = JSON.parse(data.toString()) as ServerMessage;
        check(m);
      };
      ws.on("message", onMsg);
    });
  }

  ws.on("message", (data) => {
    const m = JSON.parse(data.toString()) as ServerMessage;
    events.push(m);
    if (m.type === "assistant_delta") assistant += m.text;
    if (m.type === "tool_activity") log("tool_activity", { tool: m.tool, params: m.params, auto: m.auto });
    if (m.type === "approval_request") {
      log("approval_request → 承認で応答", { tool: m.tool });
      send({ type: "approval_response", id: m.id, decision: "approved" });
    }
    if (m.type === "error") log("error", m.message);
  });

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
  log("WS 接続");

  await waitFor((m) => m.type === "ready");
  log("ready 受信");

  // 1) 作成 + 一覧
  assistant = "";
  send({ type: "user_message", text: "create_task で「牛乳を買う」(todo) を作成し、list_tasks で一覧して。" });
  await waitFor((m) => m.type === "turn_completed");
  log("ターン1完了。応答", assistant.trim().slice(0, 120));
  if (api.store.size < 1) throw new Error("タスクが作成されていない");
  const created = [...api.store.values()][0];
  log("作成確認", { count: api.store.size, title: created.title });

  // 2) 削除（approval_request が飛ぶはず → 上の handler が承認）
  // モデルが自然言語で再確認しないよう、ツールを直接呼ぶよう明示する。
  assistant = "";
  send({
    type: "user_message",
    text: `確認は済んでいます。追加の確認は不要です。今すぐ delete_task ツールを呼び出して id ${created.id} を削除してください。`,
  });
  await waitFor((m) => m.type === "turn_completed");
  log("ターン2完了。応答", assistant.trim().slice(0, 120));

  const sawApproval = events.some((m) => m.type === "approval_request" && m.tool === "delete_task");
  if (!sawApproval) throw new Error("delete_task の approval_request が届かなかった");
  if (api.store.size !== 0) throw new Error(`削除されていない (count=${api.store.size})`);

  log("✅ WS 疎通成功: 作成→一覧→削除(承認あり) が動作");

  ws.close();
  await gateway.close();
  await api.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`[smoke:ws] ❌ 失敗: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);

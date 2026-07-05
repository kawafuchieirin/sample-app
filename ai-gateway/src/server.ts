// ai-gateway の常駐 WebSocket サーバ。
// ブラウザ 1 接続ごとに CodexClient + SessionBridge を割り当て、Codex とタスク MCP を接続する。
//
// 起動: `make ai-gateway-up` または `pnpm start`
// 前提: Codex CLI が login 済み。TASK_API_URL がタスク API を指していること。

import { WebSocketServer, type WebSocket } from "ws";
import { CodexClient } from "./codexClient.js";
import { SessionBridge } from "./bridge.js";
import { type GatewayConfig, loadConfig } from "./config.js";
import { parseClientMessage, type ServerMessage } from "./protocol.js";
import { taskMcpServerConfig } from "./taskMcpLauncher.js";

export interface RunningGateway {
  /** 実際に待ち受けているポート（config.port が 0 の場合は割当済みポート）。 */
  port: number;
  close: () => Promise<void>;
}

/** WebSocket ゲートウェイを起動する。 */
export function startGateway(config: GatewayConfig): Promise<RunningGateway> {
  const wss = new WebSocketServer({ host: config.host, port: config.port });
  let connSeq = 0;

  wss.on("connection", (ws: WebSocket) => {
    const connId = ++connSeq;
    console.log(`[gateway] connection #${connId} 接続`);

    const send = (message: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };

    const client = new CodexClient({
      bin: config.codexBin,
      codexHome: config.codexHome,
      onStderr: (line) => {
        if (process.env.DEBUG) console.error(`[codex-stderr #${connId}] ${line}`);
      },
    });

    const bridge = new SessionBridge(client, {
      model: config.model,
      mcpServers: { task: taskMcpServerConfig(config.taskApiUrl) },
      send,
    });

    client.start();

    bridge.init().catch((err: unknown) => {
      console.error(`[gateway #${connId}] init 失敗:`, err);
      send({
        type: "error",
        message: `初期化に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
      ws.close();
    });

    ws.on("message", (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) {
        send({ type: "error", message: "不正なメッセージ形式です" });
        return;
      }
      bridge.handleClientMessage(msg).catch((err: unknown) => {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      });
    });

    ws.on("close", () => {
      console.log(`[gateway] connection #${connId} 切断`);
      bridge.close();
    });

    ws.on("error", (err) => {
      console.error(`[gateway #${connId}] ws error:`, err.message);
    });
  });

  return new Promise((resolve) => {
    wss.on("listening", () => {
      const addr = wss.address();
      const port = typeof addr === "object" && addr ? addr.port : config.port;
      console.log(`[gateway] listening on ws://${config.host}:${port}`);
      console.log(`[gateway] TASK_API_URL=${config.taskApiUrl}`);
      resolve({
        port,
        close: () =>
          new Promise<void>((r) => {
            wss.close(() => r());
          }),
      });
    });
  });
}

// このファイルを直接実行したときだけサーバを起動する（import 時は起動しない）。
const isEntry = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (isEntry) {
  const config = loadConfig();
  startGateway(config).then((g) => {
    process.on("SIGINT", () => {
      console.log("\n[gateway] shutting down");
      void g.close().then(() => process.exit(0));
    });
  });
}

// Codex に渡す「task MCP サーバ」の起動設定を組み立てる。
// 開発時は tsx で TS を直接実行する。Codex 本体がこの command を子プロセスとして spawn する。

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServerConfig } from "./session.js";

const here = dirname(fileURLToPath(import.meta.url));

/** タスク MCP サーバの起動設定。taskApiUrl は MCP サーバの TASK_API_URL に渡る。 */
export function taskMcpServerConfig(taskApiUrl: string): McpServerConfig {
  const script = resolve(here, "mcpTaskServer.ts");
  const tsxBin = resolve(here, "..", "node_modules", ".bin", "tsx");
  return {
    command: tsxBin,
    args: [script],
    env: {
      TASK_API_URL: taskApiUrl,
      // Codex が最小 env で spawn する場合に備え PATH を引き継ぐ。
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    },
    startup_timeout_sec: 30,
  };
}

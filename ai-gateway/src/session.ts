// Codex app-server のハンドシェイクとスレッド開始をまとめた共通ヘルパー。
//
//   initialize → initialized 通知 → thread/start
//
// を実行し、以降のターンで使う threadId を返す。smoke / chat の双方から使う。

import type { CodexClient } from "./codexClient.js";
import type { InitializeParams } from "./generated/InitializeParams.js";
import type { InitializeResponse } from "./generated/InitializeResponse.js";
import type { ThreadStartParams } from "./generated/v2/ThreadStartParams.js";
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse.js";

/** Codex に接続する MCP サーバ 1 つ分の起動設定（config.toml の mcp_servers 相当）。 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  startup_timeout_sec?: number;
}

export interface StartThreadOptions {
  /** クライアント名（analytics 表示用）。 */
  clientName?: string;
  /** 使用モデル。未指定なら Codex の既定。 */
  model?: string;
  /** Codex に接続する MCP サーバ群（名前 → 起動設定）。 */
  mcpServers?: Record<string, McpServerConfig>;
}

export interface StartedThread {
  threadId: string;
  model: string;
  codexHome: string;
}

/** ハンドシェイクしてスレッドを開始し、threadId 等を返す。 */
export async function startThread(
  client: CodexClient,
  options: StartThreadOptions = {},
): Promise<StartedThread> {
  const initParams: InitializeParams = {
    clientInfo: {
      name: options.clientName ?? "ai-gateway",
      title: "AI Gateway",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: false, requestAttestation: false },
  };
  const init = await client.request<InitializeResponse>("initialize", initParams);

  client.notify("initialized");

  // shell/FS を触らせないため read-only。破壊的操作は承認要求（on-request）に回す。
  // MCP サーバは thread/start の config（config.toml 相当）で宣言する。
  const threadParams: ThreadStartParams = {
    sandbox: "read-only",
    approvalPolicy: "on-request",
    ...(options.model ? { model: options.model } : {}),
    // config は config.toml 相当の任意 JSON。生成型は厳密な JsonValue を要求するため
    // 構造的にキャストする（mcp_servers は Codex 側で解釈される）。
    ...(options.mcpServers
      ? { config: { mcp_servers: options.mcpServers } as unknown as ThreadStartParams["config"] }
      : {}),
  };
  const thread = await client.request<ThreadStartResponse>("thread/start", threadParams);

  return {
    threadId: thread.thread.id,
    model: thread.model,
    codexHome: String(init.codexHome),
  };
}

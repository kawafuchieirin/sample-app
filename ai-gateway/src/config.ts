// ai-gateway の設定（すべて環境変数から注入）。

export interface GatewayConfig {
  host: string;
  port: number;
  taskApiUrl: string;
  codexBin: string;
  codexHome: string | undefined;
  model: string | undefined;
}

export function loadConfig(): GatewayConfig {
  return {
    // セキュリティ: 既定は localhost のみ待受（外部公開しない）。
    host: process.env.GATEWAY_HOST ?? "127.0.0.1",
    port: Number(process.env.GATEWAY_PORT ?? "8787"),
    // MCP task サーバが叩くタスク API のベース URL（LocalStack の api_endpoint 等）。
    taskApiUrl: process.env.TASK_API_URL ?? "http://localhost:4566",
    codexBin: process.env.CODEX_BIN ?? "codex",
    codexHome: process.env.CODEX_HOME,
    model: process.env.CODEX_MODEL,
  };
}

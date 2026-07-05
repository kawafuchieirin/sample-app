// P3: MCP task サーバの疎通確認。
// インメモリのモックタスク API を立て、Codex に task MCP サーバを接続し、
// 「タスクを作って一覧して」と指示 → 実際にツールが呼ばれてストアに反映されるかを検証する。
//
// 実行: `make ai-gateway-smoke-mcp` または `pnpm smoke:mcp`（実 Codex を使う）

import { CodexClient } from "./codexClient.js";
import { startThread } from "./session.js";
import { runTurn } from "./runTurn.js";
import { taskMcpServerConfig } from "./taskMcpLauncher.js";
import { startMockTaskApi } from "./devMockTaskApi.js";

function log(label: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.log(`[smoke:mcp] ${label}${suffix}`);
}

async function main(): Promise<void> {
  const api = await startMockTaskApi();
  log("モックタスク API 起動", { url: api.url });

  const client = new CodexClient({
    bin: process.env.CODEX_BIN ?? "codex",
    codexHome: process.env.CODEX_HOME,
    onStderr: (line) => {
      if (process.env.DEBUG) console.error(`[codex-stderr] ${line}`);
    },
  });

  // 承認・elicitation は smoke では自動承認する（削除確認など）。
  client.setServerRequestHandler((method, params) => {
    log(`サーバリクエスト: ${method}`, params);
    if (method === "mcpServer/elicitation/request") {
      return { action: "accept", content: { confirm: true } };
    }
    // 承認要求は許可扱い（形はメソッド依存。P5 で bridge が正式対応）。
    return { decision: "approved" };
  });

  client.start();

  try {
    const { threadId, model } = await startThread(client, {
      clientName: "ai-gateway-smoke-mcp",
      model: process.env.CODEX_MODEL,
      mcpServers: { task: taskMcpServerConfig(api.url) },
    });
    log("thread/start OK", { threadId, model });

    const prompt =
      "task MCP の create_task を使って次の2件を作成してください: " +
      "1) title「牛乳を買う」status todo, 2) title「部屋を掃除する」status todo。" +
      "作成後、list_tasks で一覧を表示してください。";
    log("指示送信", { prompt });

    const answer = await runTurn(client, threadId, prompt, {
      onDelta: (d) => process.stdout.write(d),
      timeoutMs: 120_000,
    });
    process.stdout.write("\n");
    log("アシスタント応答", answer.trim());

    // 検証: ストアにタスクが作成されているか
    const titles = [...api.store.values()].map((t) => t.title);
    log("ストアの状態", { count: api.store.size, titles });

    const hasMilk = titles.some((t) => t.includes("牛乳"));
    const hasClean = titles.some((t) => t.includes("掃除"));
    if (api.store.size >= 2 && hasMilk && hasClean) {
      log("✅ MCP 疎通成功: create_task が実際に /tasks を叩いた");
    } else {
      throw new Error(`期待したタスクが作成されていません（count=${api.store.size}, titles=${JSON.stringify(titles)}）`);
    }
  } finally {
    client.stop();
    await api.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`[smoke:mcp] ❌ 失敗: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);

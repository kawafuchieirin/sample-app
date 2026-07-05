// P2: Codex app-server との最小疎通スクリプト。
//
//   initialize → initialized → thread/start → turn/start → (ストリーム受信) → turn/completed
//
// を一通り通し、記事の手法が手元の Codex で実際に動くことを確認する。
// 実行: `make ai-gateway-smoke` または `pnpm smoke`

import { CodexClient } from "./codexClient.js";
import { startThread } from "./session.js";
import { runTurn } from "./runTurn.js";

const PROMPT = process.argv[2] ?? "こんにちは。1 + 1 を計算して、答えの数字だけを返してください。";

function log(label: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.log(`[smoke] ${label}${suffix}`);
}

async function main(): Promise<void> {
  const client = new CodexClient({
    bin: process.env.CODEX_BIN ?? "codex",
    codexHome: process.env.CODEX_HOME,
    onStderr: (line) => console.error(`[codex-stderr] ${line}`),
  });

  // 承認要求は smoke では扱わない（read-only + 単純プロンプトでは想定外）。
  client.setServerRequestHandler((method, params) => {
    log(`⚠ 想定外のサーバリクエスト: ${method}`, params);
    throw new Error(`smoke では承認フローを扱いません: ${method}`);
  });

  client.start();

  try {
    const { threadId, model, codexHome } = await startThread(client, {
      clientName: "ai-gateway-smoke",
      model: process.env.CODEX_MODEL,
    });
    log("thread/start OK", { threadId, model, codexHome });

    log("turn/start 送信", { prompt: PROMPT });
    const answer = await runTurn(client, threadId, PROMPT, {
      onDelta: (delta) => process.stdout.write(delta),
      timeoutMs: 60_000,
    });
    process.stdout.write("\n");
    log("✅ 疎通成功。アシスタント応答:", answer.trim());
  } finally {
    client.stop();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`[smoke] ❌ 失敗: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);

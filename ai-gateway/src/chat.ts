// ローカルで Codex と対話するための CLI（チャット REPL）。
//
// ブラウザ UI（P4）ができるまでの「試す」用エントリ。1 つのスレッドを開き、
// 入力 → ストリーミング応答 → 次の入力… を繰り返す。`exit` / EOF(Ctrl-D) / Ctrl-C で終了。
//
// 実行: `make ai-gateway-chat` または `pnpm chat`
// パイプ入力も可: `printf '質問\nexit\n' | pnpm chat`
//
// 注意: 現時点ではタスク操作（MCP）は未接続なので純粋な会話のみ。Codex に
// タスクを作らせる段階は SPEC の P3 以降。承認フローの UI は P5。

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { CodexClient } from "./codexClient.js";
import { startThread } from "./session.js";
import { runTurn } from "./runTurn.js";

const PROMPT = "\x1b[36mあなた>\x1b[0m ";

async function main(): Promise<void> {
  const client = new CodexClient({
    bin: process.env.CODEX_BIN ?? "codex",
    codexHome: process.env.CODEX_HOME,
    onStderr: (line) => {
      if (process.env.DEBUG) console.error(`[codex-stderr] ${line}`);
    },
  });

  // タスク操作（MCP）未接続の現段階では承認要求は基本発生しない。
  // REPL の readline と競合させないため、ここでは自動拒否して通知するに留める。
  // 対話的な許可 UI は P5（bridge）でブラウザ側に実装する。
  client.setServerRequestHandler((method) => {
    stdout.write(`\n\x1b[33m⚠ 承認要求 ${method} を自動拒否しました（承認 UI は P5 で実装）\x1b[0m\n`);
    return { decision: "denied" };
  });

  client.start();

  const { threadId, model, codexHome } = await startThread(client, {
    clientName: "ai-gateway-chat",
    model: process.env.CODEX_MODEL,
  });
  stdout.write(`\nCodex に接続しました (model=${model}, CODEX_HOME=${codexHome})\n`);
  stdout.write(`スレッド: ${threadId}\n`);
  stdout.write("メッセージを入力してください。終了は 'exit' / Ctrl-D。\n\n");

  const rl = createInterface({ input: stdin, output: stdout, prompt: PROMPT });
  rl.prompt();

  for await (const rawLine of rl) {
    const input = rawLine.trim();
    if (!input) {
      rl.prompt();
      continue;
    }
    if (input === "exit" || input === "quit") break;

    stdout.write("\x1b[32mCodex>\x1b[0m ");
    try {
      await runTurn(client, threadId, input, {
        onDelta: (delta) => stdout.write(delta),
      });
      stdout.write("\n\n");
    } catch (err) {
      stdout.write(`\n\x1b[31m[エラー]\x1b[0m ${err instanceof Error ? err.message : String(err)}\n\n`);
    }
    rl.prompt();
  }

  stdout.write("\n終了します。\n");
  client.stop();
  rl.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`[chat] 失敗: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);

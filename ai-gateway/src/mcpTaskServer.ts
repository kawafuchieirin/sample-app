// Codex に「道具」として接続する MCP stdio サーバ。
// Codex 本体が本ファイルを子プロセスとして spawn し、tools/call でここに届く。
// 各ツールは TaskClient 経由で既存の /tasks REST（Lambda task_api）を呼ぶ。
//
// Codex にファイルシステムや shell は渡さず、この 4 ツールだけを能力として与える。
//
// 承認は Codex ネイティブの仕組みに委ねる: approvalPolicy=on-request のとき、Codex は
// 各ツール呼び出しの前に mcpServer/elicitation/request（_meta.codex_approval_kind =
// "mcp_tool_call"）をクライアント（gateway）へ送る。gateway 側でツール名を見て
// 読み取り/作成は自動許可・削除はブラウザ確認、に振り分ける（P5）。
// そのためこのサーバ側では自前の確認は行わず、ツールは素直に実行する。
//
// 単体起動: `TASK_API_URL=... tsx src/mcpTaskServer.ts`（通常は Codex が起動する）

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TaskApiError, TaskClient, type Task } from "./taskClient.js";

const STATUS = z.enum(["todo", "in_progress", "done"]);

const client = new TaskClient();

const server = new McpServer({
  name: "task-mcp",
  version: "0.1.0",
});

/** ツール結果の共通整形。text（人間可読）と structuredContent（機械可読）を返す。 */
function ok(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function fail(err: unknown) {
  const message =
    err instanceof TaskApiError
      ? `タスク API エラー (${err.status}): ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function summarize(task: Task): string {
  return `- [${task.status}] ${task.title}${task.description ? ` — ${task.description}` : ""} (id: ${task.id})`;
}

server.registerTool(
  "list_tasks",
  {
    title: "タスク一覧",
    description: "登録済みのタスクを全件取得する。ステータスや件数の確認に使う。",
    inputSchema: {},
  },
  async () => {
    try {
      const tasks = await client.list();
      const text = tasks.length
        ? `タスク ${tasks.length} 件:\n${tasks.map(summarize).join("\n")}`
        : "タスクはありません。";
      return ok(text, { tasks });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "create_task",
  {
    title: "タスク作成",
    description: "新しいタスクを作成する。title は必須。status 省略時は todo。",
    inputSchema: {
      title: z.string().min(1).describe("タスク名（必須）"),
      description: z.string().optional().describe("詳細（任意）"),
      status: STATUS.optional().describe("状態。省略時 todo"),
    },
  },
  async ({ title, description, status }) => {
    try {
      const task = await client.create({ title, description, status });
      return ok(`作成しました:\n${summarize(task)}`, { task });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "update_task",
  {
    title: "タスク更新",
    description: "既存タスクを更新する。id は必須。変更したいフィールドのみ指定する。",
    inputSchema: {
      id: z.string().min(1).describe("対象タスクの id（必須）"),
      title: z.string().min(1).optional().describe("新しいタスク名"),
      description: z.string().optional().describe("新しい詳細"),
      status: STATUS.optional().describe("新しい状態"),
    },
  },
  async ({ id, title, description, status }) => {
    try {
      const task = await client.update(id, { title, description, status });
      return ok(`更新しました:\n${summarize(task)}`, { task });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "delete_task",
  {
    title: "タスク削除",
    description: "タスクを削除する（破壊的操作）。実行前にユーザーへ確認を求める。",
    inputSchema: {
      id: z.string().min(1).describe("削除するタスクの id（必須）"),
    },
  },
  async ({ id }) => {
    // 承認は Codex の mcp_tool_call 承認（gateway が仲介）で既に取れている前提。
    try {
      await client.remove(id);
      return ok(`削除しました (id: ${id})。`);
    } catch (err) {
      return fail(err);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout は MCP プロトコル専用。ログは stderr へ。
  process.stderr.write(`[mcp-task] connected (TASK_API_URL=${process.env.TASK_API_URL ?? "(default)"})\n`);
}

main().catch((err) => {
  process.stderr.write(`[mcp-task] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

// 開発・テスト用のインメモリ タスク API。
// LocalStack を立てずに MCP → /tasks の疎通を確認するため、backend/task_api と同じ
// エンドポイント契約（GET/POST/PUT/DELETE /tasks）を最小実装する。

import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { Task } from "./taskClient.js";

export interface MockTaskApi {
  url: string;
  store: Map<string, Task>;
  close: () => Promise<void>;
}

const VALID = new Set(["todo", "in_progress", "done"]);

function nowIso(): string {
  return new Date().toISOString();
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

/** モック API を起動し、URL と in-memory ストアを返す。seed で初期タスクを投入できる。 */
export function startMockTaskApi(seed: Task[] = []): Promise<MockTaskApi> {
  const store = new Map<string, Task>(seed.map((t) => [t.id, t]));

  const server: Server = createServer(async (req, res) => {
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean); // ["tasks", id?]
      const id = parts[1];
      const method = req.method ?? "GET";

      if (parts[0] !== "tasks") return send(404, { message: "not found" });

      if (method === "GET" && !id) return send(200, [...store.values()]);
      if (method === "GET" && id) {
        const t = store.get(id);
        return t ? send(200, t) : send(404, { message: "タスクが見つかりません" });
      }
      if (method === "POST") {
        const b = await readBody(req);
        const title = typeof b.title === "string" ? b.title.trim() : "";
        if (!title) return send(400, { message: "title は必須の文字列です" });
        const status = (b.status as string) ?? "todo";
        if (!VALID.has(status)) return send(400, { message: "status が不正です" });
        const task: Task = {
          id: randomUUID(),
          title,
          description: typeof b.description === "string" ? b.description : "",
          status: status as Task["status"],
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        store.set(task.id, task);
        return send(201, task);
      }
      if (method === "PUT" && id) {
        const existing = store.get(id);
        if (!existing) return send(404, { message: "タスクが見つかりません" });
        const b = await readBody(req);
        const updated: Task = { ...existing };
        if (typeof b.title === "string") updated.title = b.title.trim();
        if (typeof b.description === "string") updated.description = b.description;
        if (typeof b.status === "string") {
          if (!VALID.has(b.status)) return send(400, { message: "status が不正です" });
          updated.status = b.status as Task["status"];
        }
        updated.updated_at = nowIso();
        store.set(id, updated);
        return send(200, updated);
      }
      if (method === "DELETE" && id) {
        if (!store.has(id)) return send(404, { message: "タスクが見つかりません" });
        store.delete(id);
        return send(204);
      }
      return send(405, { message: "method not allowed" });
    } catch (err) {
      send(400, { message: err instanceof Error ? err.message : String(err) });
    }
  });

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        store,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

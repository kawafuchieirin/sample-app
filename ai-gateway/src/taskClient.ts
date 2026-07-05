// タスク CRUD API (/tasks) の薄い REST クライアント。
// MCP task サーバがこれを介して既存 Lambda(task_api) を呼ぶ。フロントの api.ts と同じ契約。
//
// ベース URL は環境変数 TASK_API_URL（例: LocalStack の api_endpoint）。末尾スラッシュは無視。

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
}

export class TaskApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TaskApiError";
  }
}

export class TaskClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.TASK_API_URL ?? "http://localhost:4566") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
    } catch (err) {
      // ネットワーク到達不能はそのまま伝播（呼び出し側でユーザーに提示）。
      throw new TaskApiError(
        `タスク API に接続できません (${this.baseUrl}${path}): ${err instanceof Error ? err.message : String(err)}`,
        0,
      );
    }

    if (!res.ok) {
      let message = `タスク API がエラーを返しました (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) message = body.message;
      } catch {
        // JSON でなければ既定メッセージ
      }
      throw new TaskApiError(message, res.status);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  list(): Promise<Task[]> {
    return this.request<Task[]>("/tasks");
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.request<Task>("/tasks", { method: "POST", body: JSON.stringify(input) });
  }

  update(id: string, input: UpdateTaskInput): Promise<Task> {
    return this.request<Task>(`/tasks/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async remove(id: string): Promise<void> {
    await this.request<void>(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

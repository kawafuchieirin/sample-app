import type { Task, TaskInput, TaskStatus } from "./types";

// API のベース URL。ビルド時に VITE_API_URL で注入する。
// 未設定時は同一オリジンの /api を利用する（CloudFront で API Gateway へルーティングする想定）。
const BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    let message = `リクエストに失敗しました (${response.status})`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // JSON でないレスポンスはそのまま既定メッセージを使う
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const tasksApi = {
  list: () => request<Task[]>("/tasks"),
  create: (input: TaskInput) =>
    request<Task>("/tasks", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<TaskInput> & { status?: TaskStatus }) =>
    request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/tasks/${id}`, { method: "DELETE" }),
};

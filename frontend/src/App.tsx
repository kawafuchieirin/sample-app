import { useCallback, useEffect, useState } from "react";
import { tasksApi } from "./api";
import { STATUS_LABELS, type Task, type TaskStatus } from "./types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await tasksApi.list();
      setTasks(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      const created = await tasksApi.create({ title: title.trim(), description: description.trim() });
      setTasks((prev) => [...prev, created]);
      setTitle("");
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
    }
  };

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    setError(null);
    try {
      const updated = await tasksApi.update(task.id, { status });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  const handleDelete = async (task: Task) => {
    setError(null);
    try {
      await tasksApi.remove(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <main className="container">
      <h1>タスク管理</h1>

      <form className="task-form" onSubmit={handleCreate}>
        <input
          type="text"
          placeholder="タスク名（必須）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="タスク名"
        />
        <input
          type="text"
          placeholder="詳細（任意）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="詳細"
        />
        <button type="submit" disabled={!title.trim()}>
          追加
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>読み込み中...</p>
      ) : tasks.length === 0 ? (
        <p className="empty">タスクはまだありません</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <li key={task.id} className={`task status-${task.status}`}>
              <div className="task-main">
                <span className="task-title">{task.title}</span>
                {task.description && <span className="task-desc">{task.description}</span>}
              </div>
              <div className="task-actions">
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                  aria-label="ステータス"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => handleDelete(task)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// TaskClient のユニットテスト。モックタスク API（backend/task_api と同契約）に対して
// list/create/update/remove が正しく HTTP を叩くことを検証する。

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockTaskApi, type MockTaskApi } from "../src/devMockTaskApi.js";
import { TaskApiError, TaskClient } from "../src/taskClient.js";

let api: MockTaskApi;
let client: TaskClient;

beforeAll(async () => {
  api = await startMockTaskApi();
  client = new TaskClient(api.url);
});

afterAll(async () => {
  await api.close();
});

describe("TaskClient", () => {
  it("create → list → update → remove の一連が動く", async () => {
    const created = await client.create({ title: "牛乳を買う", status: "todo" });
    expect(created.id).toBeTruthy();
    expect(created.title).toBe("牛乳を買う");
    expect(created.status).toBe("todo");

    const list = await client.list();
    expect(list.map((t) => t.id)).toContain(created.id);

    const updated = await client.update(created.id, { status: "done" });
    expect(updated.status).toBe("done");
    expect(updated.title).toBe("牛乳を買う");

    await client.remove(created.id);
    const after = await client.list();
    expect(after.map((t) => t.id)).not.toContain(created.id);
  });

  it("存在しない id の更新は 404 で TaskApiError を投げる", async () => {
    await expect(client.update("nope", { status: "done" })).rejects.toMatchObject({
      name: "TaskApiError",
      status: 404,
    });
  });

  it("title 空の作成は 400 を投げる", async () => {
    await expect(client.create({ title: "" })).rejects.toBeInstanceOf(TaskApiError);
  });

  it("接続不能なホストは status 0 の TaskApiError", async () => {
    const broken = new TaskClient("http://127.0.0.1:1"); // 到達不能ポート
    await expect(broken.list()).rejects.toMatchObject({ name: "TaskApiError", status: 0 });
  });
});

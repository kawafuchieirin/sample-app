// codexClient のユニットテスト。
// 実 Codex は起動せず、PassThrough ストリームを持つ fake プロセスを注入して
// JSON-RPC フレーミング・pending map の解決・切断時 drain・承認応答を決定的に検証する。

import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { CodexClient, CodexTransportClosedError, type CodexProcess } from "../src/codexClient.js";

/** テスト用の fake app-server。stdin に書かれた行を読み取り、stdout に注入できる。 */
class FakeCodex implements CodexProcess {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  private exitCb: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;

  /** クライアントが送ってきたメッセージ（行ごとの JSON）を収集する。 */
  readonly sent: Record<string, unknown>[] = [];

  constructor() {
    let buf = "";
    this.stdin.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) this.sent.push(JSON.parse(line));
      }
    });
  }

  /** サーバ→クライアント方向のメッセージを 1 行流す。 */
  emit(message: Record<string, unknown>): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  kill(): void {
    this.exitCb?.(0, null);
  }

  on(event: "exit" | "error", cb: (...args: never[]) => void): void {
    if (event === "exit") this.exitCb = cb as never;
  }
}

function makeClient(): { client: CodexClient; fake: FakeCodex } {
  const fake = new FakeCodex();
  const client = new CodexClient({ spawnProcess: () => fake });
  client.start();
  return { client, fake };
}

/** 次のイベントループまで待つ（ストリーム配送を確定させる）。 */
const tick = () => new Promise((r) => setImmediate(r));

describe("CodexClient", () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("リクエストを改行区切り JSON で送り、id 対応する応答で解決する", async () => {
    const { client, fake } = makeClient();
    cleanup = () => client.stop();

    const promise = client.request<{ ok: boolean }>("initialize", { hello: "world" });
    await tick();

    // 送信された行を検証
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]).toMatchObject({ jsonrpc: "2.0", id: 1, method: "initialize", params: { hello: "world" } });

    // 応答を注入
    fake.emit({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("エラー応答は CodexRpcError で reject する", async () => {
    const { client, fake } = makeClient();
    cleanup = () => client.stop();

    const promise = client.request("thread/start");
    await tick();
    fake.emit({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "boom" } });

    await expect(promise).rejects.toMatchObject({ name: "CodexRpcError", code: -32001, message: "boom" });
  });

  it("通知を method/params でリスナーに配送する", async () => {
    const { client, fake } = makeClient();
    cleanup = () => client.stop();

    const received: Array<[string, unknown]> = [];
    client.onNotification((method, params) => received.push([method, params]));

    fake.emit({ jsonrpc: "2.0", method: "item/agentMessage/delta", params: { delta: "あ" } });
    await tick();

    expect(received).toEqual([["item/agentMessage/delta", { delta: "あ" }]]);
  });

  it("サーバリクエストをハンドラで処理し、結果を id 付きで返す", async () => {
    const { client, fake } = makeClient();
    cleanup = () => client.stop();

    client.setServerRequestHandler((method) => ({ approved: method }));
    fake.emit({ jsonrpc: "2.0", id: 42, method: "item/permissions/requestApproval", params: {} });
    await tick();

    const response = fake.sent.find((m) => m.id === 42);
    expect(response).toMatchObject({ jsonrpc: "2.0", id: 42, result: { approved: "item/permissions/requestApproval" } });
  });

  it("ハンドラ未設定のサーバリクエストには -32601 を返す", async () => {
    const { client, fake } = makeClient();
    cleanup = () => client.stop();

    fake.emit({ jsonrpc: "2.0", id: 7, method: "execCommandApproval", params: {} });
    await tick();

    const response = fake.sent.find((m) => m.id === 7) as { error?: { code: number } };
    expect(response?.error?.code).toBe(-32601);
  });

  it("トランスポート断で pending をすべて reject する", async () => {
    const { client, fake } = makeClient();

    const p1 = client.request("a");
    const p2 = client.request("b");
    await tick();

    fake.kill(); // exit を発火

    await expect(p1).rejects.toBeInstanceOf(CodexTransportClosedError);
    await expect(p2).rejects.toBeInstanceOf(CodexTransportClosedError);
  });

  it("不正な JSON 行は破棄し、後続の正しい応答は処理する", async () => {
    const { client, fake } = makeClient();
    cleanup = () => client.stop();

    const promise = client.request<number>("ping");
    await tick();

    fake.stdout.write("this is not json\n");
    fake.emit({ jsonrpc: "2.0", id: 1, result: 99 });

    await expect(promise).resolves.toBe(99);
  });
});

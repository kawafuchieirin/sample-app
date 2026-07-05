// Codex app-server との JSON-RPC 2.0 over stdio クライアント。
//
// フレーミングは「1 行 = 1 メッセージ（改行区切り JSON）」。writer/reader を分離し、
// リクエストは pending map で id 対応を取る。トランスポート断（プロセス終了 / stdout close）
// 時は pending をすべて reject して呼び出し側をハングさせない。
//
// このクライアントはプロトコルに依存しない土台であり、thread/turn 等の具体的な
// メソッドは呼び出し側（bridge / smoke）が生成型 (src/generated) を使って組み立てる。

import { spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/** JSON-RPC のリクエスト id。数値で採番する。 */
type RequestId = number;

/** サーバからのリクエスト（承認要求など）を処理して結果を返すハンドラ。 */
export type ServerRequestHandler = (
  method: string,
  params: unknown,
) => Promise<unknown> | unknown;

/** サーバからの通知（ストリーム）を受け取るリスナー。 */
export type NotificationListener = (method: string, params: unknown) => void;

/**
 * codexClient が必要とする子プロセスの最小インターフェース。
 * 実運用では child_process.spawn の戻り値がこれを満たし、テストでは
 * PassThrough ストリームを持つ fake を注入して決定的に検証できる。
 */
export interface CodexProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals): void;
  on(event: "exit", cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}

export interface CodexClientOptions {
  /** Codex CLI の実行パス。既定は "codex"。 */
  bin?: string;
  /** CODEX_HOME（認証・設定の場所）。未指定なら Codex 既定（~/.codex）。 */
  codexHome?: string;
  /** 追加の環境変数。 */
  env?: NodeJS.ProcessEnv;
  /** app-server 起動時の作業ディレクトリ。 */
  cwd?: string;
  /** 標準エラー出力の行コールバック（デバッグ用）。 */
  onStderr?: (line: string) => void;
  /** プロセス生成関数の差し替え口（テスト用）。既定は codex app-server を spawn する。 */
  spawnProcess?: () => CodexProcess;
}

/** pending map のエントリ。 */
interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  method: string;
}

export class CodexTransportClosedError extends Error {
  constructor(message = "Codex app-server のトランスポートが閉じられました") {
    super(message);
    this.name = "CodexTransportClosedError";
  }
}

export class CodexRpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "CodexRpcError";
  }
}

export class CodexClient {
  private proc: CodexProcess | null = null;
  private readonly pending = new Map<RequestId, Pending>();
  private nextId = 1;
  private closed = false;
  private readonly notificationListeners = new Set<NotificationListener>();
  private serverRequestHandler: ServerRequestHandler | null = null;
  private stdoutReader: Interface | null = null;

  constructor(private readonly options: CodexClientOptions = {}) {}

  /** app-server を子プロセスとして起動し、reader/writer を接続する。 */
  start(): void {
    if (this.proc) throw new Error("CodexClient は既に起動しています");

    const proc = (this.options.spawnProcess ?? (() => this.defaultSpawn()))();
    this.proc = proc;

    // reader: stdout を行単位で分割して 1 行 = 1 メッセージとして処理する。
    this.stdoutReader = createInterface({ input: proc.stdout });
    this.stdoutReader.on("line", (line) => this.handleLine(line));

    // stderr はデバッグ用に転送する（プロトコルには含まれない）。
    const stderrReader = createInterface({ input: proc.stderr });
    stderrReader.on("line", (line) => this.options.onStderr?.(line));

    proc.on("exit", (code, signal) => {
      this.handleClose(
        new CodexTransportClosedError(
          `Codex app-server が終了しました (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        ),
      );
    });
    proc.on("error", (err) => {
      this.handleClose(
        new CodexTransportClosedError(`Codex app-server の起動に失敗しました: ${err.message}`),
      );
    });
  }

  /** 通知リスナーを登録する。解除用の関数を返す。 */
  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /** サーバからのリクエスト（承認要求など）を処理するハンドラを設定する。 */
  setServerRequestHandler(handler: ServerRequestHandler | null): void {
    this.serverRequestHandler = handler;
  }

  /** リクエストを送り、応答（result）を返す。エラー応答は CodexRpcError で reject。 */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed || !this.proc) {
      return Promise.reject(new CodexTransportClosedError());
    }
    const id = this.nextId++;
    const message: Record<string, unknown> = { jsonrpc: "2.0", id, method };
    if (params !== undefined) message.params = params;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        method,
      });
      this.write(message);
    });
  }

  /** 通知を送る（id なし・応答なし）。 */
  notify(method: string, params?: unknown): void {
    const message: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (params !== undefined) message.params = params;
    this.write(message);
  }

  /** app-server を停止する。pending はすべて reject される。 */
  stop(): void {
    this.proc?.kill("SIGTERM");
  }

  // --- 内部処理 -------------------------------------------------------------

  private defaultSpawn(): CodexProcess {
    const bin = this.options.bin ?? "codex";
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.options.env };
    if (this.options.codexHome) env.CODEX_HOME = this.options.codexHome;

    return spawn(bin, ["app-server", "--stdio"], {
      cwd: this.options.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as unknown as CodexProcess;
  }

  private write(message: Record<string, unknown>): void {
    if (this.closed || !this.proc) throw new CodexTransportClosedError();
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // 不正な行は破棄（stdout にプロトコル外の出力が混じった場合の保険）。
      this.options.onStderr?.(`[parse-error] ${trimmed}`);
      return;
    }

    const hasId = msg.id !== undefined && msg.id !== null;
    const hasMethod = typeof msg.method === "string";

    if (hasMethod && hasId) {
      // サーバ→クライアントのリクエスト（承認要求など）。
      void this.handleServerRequest(msg);
    } else if (hasMethod) {
      // 通知（ストリーム）。
      this.emitNotification(msg.method as string, msg.params);
    } else if (hasId) {
      // リクエストへの応答。
      this.resolveResponse(msg);
    }
    // それ以外（id も method もない）は無視。
  }

  private emitNotification(method: string, params: unknown): void {
    for (const listener of this.notificationListeners) {
      try {
        listener(method, params);
      } catch (err) {
        this.options.onStderr?.(`[notification-listener-error] ${String(err)}`);
      }
    }
  }

  private resolveResponse(msg: Record<string, unknown>): void {
    const id = msg.id as RequestId;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);

    if (msg.error) {
      const err = msg.error as { code?: number; message?: string; data?: unknown };
      pending.reject(
        new CodexRpcError(
          err.message ?? `RPC エラー (${pending.method})`,
          err.code ?? -1,
          err.data,
        ),
      );
    } else {
      pending.resolve(msg.result);
    }
  }

  private async handleServerRequest(msg: Record<string, unknown>): Promise<void> {
    const id = msg.id as RequestId;
    const method = msg.method as string;
    const handler = this.serverRequestHandler;

    if (!handler) {
      // ハンドラ未設定なら「メソッド未対応」を返す（JSON-RPC -32601）。
      this.write({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `ハンドラ未設定: ${method}` },
      });
      return;
    }

    try {
      const result = await handler(method, msg.params);
      this.write({ jsonrpc: "2.0", id, result: result ?? null });
    } catch (err) {
      this.write({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private handleClose(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.stdoutReader?.close();

    // pending をすべて drain して呼び出し側のハングを防ぐ。
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

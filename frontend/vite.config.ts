import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ローカルのタスク API(make local-api) のポート。8788（run-ai-gateway.sh と揃える）。
const LOCAL_API_PORT = 8788;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  // 開発時: VITE_API_URL 未設定なら api.ts は既定の `/api` を使う。
  // その `/api/*` をローカル API サーバへプロキシし、`/api` を取り除いて転送する。
  // これにより `pnpm dev` だけで（環境変数なしで）タスク API に到達できる。
  server: {
    // 既定だと localhost が IPv6(::1) のみに束縛され、ブラウザが 127.0.0.1(IPv4) で
    // アクセスすると ERR_CONNECTION_REFUSED になることがある。全インターフェースで待受する。
    host: true,
    proxy: {
      "/api": {
        // localhost は IPv6(::1) に解決されて別プロセスへ流れることがあるため IPv4 を明示。
        target: `http://127.0.0.1:${LOCAL_API_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_");
  const configuredUrl = environment.VITE_SUPABASE_URL?.trim();
  let connectSource = "'self'";
  if (configuredUrl) {
    const url = new URL(configuredUrl);
    connectSource = `'self' ${url.origin} wss://${url.host}`;
  }
  return {
    plugins: [react(), {
      name: "safeflow-csp",
      transformIndexHtml(html: string) { return html.replace("__SAFEFLOW_CONNECT_SRC__", connectSource); },
    }],
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});

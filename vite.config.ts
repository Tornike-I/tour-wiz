import { defineConfig, configDefaults } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { route } from "./api/route";

// Serves api/route.ts during `npm run dev`, as Vercel does in production. The key comes from .env.
function routeApi(key: string | undefined): Plugin {
  return {
    name: "tour-wiz-route-api",
    configureServer(server) {
      server.middlewares.use("/api/route", async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          // Leave body null; route() answers 400.
        }
        const { status, json } = await route(body, key);
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(json));
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), routeApi(loadEnv(mode, process.cwd(), "").ORS_API_KEY)],
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));

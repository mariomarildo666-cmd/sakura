import "dotenv/config";

import { createServer, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { analyzeWithSakura } from "./agents/sakura.js";
import { fetchChartCandlesForTimeframe, lookupCa } from "./lib/ca-lookup.js";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve("public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing URL" });
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/ca") {
      const address = url.searchParams.get("address")?.trim() || "";
      if (!address) {
        sendJson(res, 400, { error: "address query is required" });
        return;
      }

      const result = await lookupCa(address);
      sendJson(res, 200, result);
      return;
    }

    if (url.pathname === "/api/chart") {
      const address = url.searchParams.get("address")?.trim() || "";
      const timeframe = url.searchParams.get("timeframe")?.trim() || "15m";
      if (!address) {
        sendJson(res, 400, { error: "address query is required" });
        return;
      }

      const result = await fetchChartCandlesForTimeframe(address, timeframe);
      sendJson(res, 200, result);
      return;
    }

    if (url.pathname === "/api/analyze") {
      const address = url.searchParams.get("address")?.trim() || "";
      if (!address) {
        sendJson(res, 400, { error: "address query is required" });
        return;
      }

      const result = await analyzeWithSakura(address);
      sendJson(res, 200, result);
      return;
    }

    const filePath = resolvePublicPath(url.pathname);
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ENOENT")) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

function resolvePublicPath(urlPath: string) {
  const normalized = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.resolve(PUBLIC_DIR, `.${normalized}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    throw new Error("Invalid path");
  }
  return filePath;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

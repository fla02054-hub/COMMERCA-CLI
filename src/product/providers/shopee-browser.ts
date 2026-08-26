import { createServer, type Server } from "node:http";
import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 8765;

interface ExtensionProduct {
  name: string;
  price?: number;
  url: string;
  source?: string;
}

interface ExtensionResult {
  products?: ExtensionProduct[];
  error?: string;
}

export interface ShopeeBrowserProviderOptions {
  timeoutMs?: number;
  port?: number;
}

export class ShopeeBrowserProvider implements ProductProvider {
  readonly name = "shopee-browser";
  private readonly timeoutMs: number;
  private readonly port: number;
  private server?: Server;
  private pending = new Map<string, { resolve: (value: ExtensionResult) => void; reject: (error: Error) => void }>();

  constructor(options: ShopeeBrowserProviderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.port = options.port ?? BRIDGE_PORT;
  }

  async search(query: string): Promise<Product[]> {
    await this.startBridge();

    const id = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resultPromise = new Promise<ExtensionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("COMMERCA Shopee Extension ไม่ตอบกลับ — ตรวจว่า Extension เปิดใช้งานและแท็บ Shopee เปิดอยู่"));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });

    await this.sendCommand({ id, type: "SEARCH", query });
    const result = await resultPromise;
    await this.stopBridge();

    if (result.error) throw new Error(result.error);
    return (result.products ?? []).map((product, index) => ({
      id: `shopee-extension-${index + 1}`,
      name: product.name || `Shopee product ${index + 1}`,
      url: product.url,
      price: product.price,
      source: "shopee-browser",
      discoveredAt: new Date().toISOString(),
    } satisfies Product));
  }

  private async startBridge(): Promise<void> {
    if (this.server) return;
    this.server = createServer(async (request, response) => {
      try {
        if (request.method === "GET" && request.url === "/command") {
          const command = (this as unknown as { command?: unknown }).command;
          if (!command) {
            response.writeHead(204);
            response.end();
            return;
          }
          response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
          response.end(JSON.stringify(command));
          return;
        }

        if (request.method === "POST" && request.url === "/result") {
          const body = await readBody(request);
          const payload = JSON.parse(body) as { id: string; result?: ExtensionResult; error?: string };
          const pending = this.pending.get(payload.id);
          if (pending) {
            this.pending.delete(payload.id);
            if (payload.error) pending.resolve({ error: payload.error });
            else pending.resolve(payload.result ?? {});
          }
          response.writeHead(204, { "access-control-allow-origin": "*" });
          response.end();
          return;
        }

        response.writeHead(404);
        response.end();
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(String(error));
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, BRIDGE_HOST, () => resolve());
    });
  }

  private command?: { id: string; type: "SEARCH"; query: string };

  private async sendCommand(command: { id: string; type: "SEARCH"; query: string }): Promise<void> {
    this.command = command;
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    // Keep the command available while the extension polls. It is cleared only
    // after the extension has posted a matching result.
    const originalResolve = this.pending.get(command.id)?.resolve;
    if (!originalResolve) return;
    this.pending.get(command.id)!.resolve = (result) => {
      this.command = undefined;
      originalResolve(result);
    };
  }

  private async stopBridge(): Promise<void> {
    this.command = undefined;
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

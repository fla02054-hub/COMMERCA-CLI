export interface BrowserControllerOptions {
  port?: number;
  profileDir?: string;
  executablePath?: string;
  headless?: boolean;
}

interface CdpTarget {
  type: string;
  webSocketDebuggerUrl?: string;
}

export class BrowserController {
  private readonly port: number;
  private readonly options: BrowserControllerOptions;
  private socket?: WebSocket;
  private sequence = 0;

  constructor(options: BrowserControllerOptions = {}) {
    this.options = options;
    this.port = options.port ?? 9222;
  }

  async connect(): Promise<void> {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    if (!response.ok) throw new Error(`Chrome DevTools HTTP ${response.status}`);
    const targets = (await response.json()) as CdpTarget[];
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page?.webSocketDebuggerUrl) {
      throw new Error("No Chrome page target is available. Start Chrome with remote debugging first.");
    }
    this.socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      const socket = this.socket!;
      const onOpen = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("Could not connect to Chrome DevTools")); };
      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
      };
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
    });
  }

  async open(url: string): Promise<void> {
    if (!this.socket) await this.connect();
    await this.command("Page.enable");
    await this.command("Page.navigate", { url });
    await this.wait(1500);
  }

  async evaluate<T>(expression: string): Promise<T> {
    if (!this.socket) await this.connect();
    const response = await this.command<{ result: { value?: T; description?: string } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
    );
    if (response.result?.value !== undefined) return response.result.value;
    throw new Error(response.result?.description ?? "Browser evaluation returned no value");
  }

  async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private command<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Browser is not connected"));
    }
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const socket = this.socket!;
      const listener = (event: MessageEvent) => {
        const response = JSON.parse(String(event.data)) as { id?: number; result?: T; error?: { message: string } };
        if (response.id !== id) return;
        socket.removeEventListener("message", listener);
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result as T);
      };
      socket.addEventListener("message", listener);
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

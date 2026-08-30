import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface BrowserControllerOptions {
  port?: number;
  profileDir?: string;
  executablePath?: string;
  headless?: boolean;
  launchIfNeeded?: boolean;
  extensionPath?: string;
  /** Use the normal Chrome user-data directory so existing Shopee login cookies are available. */
  useExistingChromeProfile?: boolean;
}

interface CdpTarget { type: string; webSocketDebuggerUrl?: string; }

export class BrowserController {
  private readonly port: number;
  private readonly options: BrowserControllerOptions;
  private socket?: WebSocket;
  private sequence = 0;
  private process?: ChildProcess;

  constructor(options: BrowserControllerOptions = {}) {
    this.options = options;
    this.port = options.port ?? 9222;
  }

  async connect(): Promise<void> {
    if (await this.tryConnect()) return;
    if (this.options.launchIfNeeded === false) throw new Error("Chrome DevTools is not available on port 9222. Start Chrome with remote debugging enabled.");
    await this.launchChrome();
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await this.tryConnect()) return;
      await this.wait(500);
    }
    throw new Error("Could not connect to Chrome with remote debugging enabled. Close Chrome and start it with --remote-debugging-port=9222, then retry.");
  }

  private async tryConnect(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
      if (!response.ok) return false;
      const targets = (await response.json()) as CdpTarget[];
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (!page?.webSocketDebuggerUrl) return false;
      this.socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise<void>((resolvePromise, reject) => {
        const socket = this.socket!;
        const onOpen = () => { cleanup(); resolvePromise(); };
        const onError = () => { cleanup(); reject(new Error("Could not connect to Chrome DevTools")); };
        const cleanup = () => { socket.removeEventListener("open", onOpen); socket.removeEventListener("error", onError); };
        socket.addEventListener("open", onOpen); socket.addEventListener("error", onError);
      });
      return true;
    } catch { this.socket = undefined; return false; }
  }

  private async launchChrome(): Promise<void> {
    const executable = this.options.executablePath ?? this.findChrome();
    if (!executable) throw new Error("Chrome executable not found. Set COMMERCA_CHROME_PATH if needed.");

    const useExisting = this.options.useExistingChromeProfile === true;
    const profileDir = this.options.profileDir ?? (useExisting
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "User Data")
      : join(homedir(), ".commerca-cli", "chrome-profile"));
    mkdirSync(profileDir, { recursive: true });

    const args = [`--remote-debugging-port=${this.port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check"];
    if (useExisting) args.push(`--profile-directory=${process.env.COMMERCA_CHROME_PROFILE ?? "Default"}`);
    const extensionPath = this.options.extensionPath ?? resolve(process.cwd(), "extension");
    if (!useExisting && existsSync(extensionPath)) {
      args.push(`--disable-extensions-except=${extensionPath}`);
      args.push(`--load-extension=${extensionPath}`);
    }
    if (this.options.headless) args.push("--headless=new");
    this.process = spawn(executable, args, { detached: false, stdio: "ignore" });
  }

  private findChrome(): string | undefined {
    const explicit = process.env.COMMERCA_CHROME_PATH;
    if (explicit && existsSync(explicit)) return explicit;
    const candidates = process.platform === "win32"
      ? [join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"), join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"), join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData\\Local"), "Google\\Chrome\\Application\\chrome.exe")]
      : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
    return candidates.find((candidate) => existsSync(candidate));
  }

  async open(url: string): Promise<void> {
    if (!this.socket) await this.connect();
    await this.command("Page.enable");
    await this.command("Page.navigate", { url });
    await this.wait(1500);
  }

  async evaluate<T>(expression: string): Promise<T> {
    if (!this.socket) await this.connect();
    const response = await this.command<{ result: { value?: T; description?: string } }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.result?.value !== undefined) return response.result.value;
    throw new Error(response.result?.description ?? "Browser evaluation returned no value");
  }

  async wait(ms: number): Promise<void> { await new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
  close(): void { this.socket?.close(); this.socket = undefined; this.process = undefined; }

  private command<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Browser is not connected"));
    const id = ++this.sequence;
    return new Promise<T>((resolvePromise, reject) => {
      const socket = this.socket!;
      const listener = (event: MessageEvent) => {
        const response = JSON.parse(String(event.data)) as { id?: number; result?: T; error?: { message: string } };
        if (response.id !== id) return;
        socket.removeEventListener("message", listener);
        if (response.error) reject(new Error(response.error.message)); else resolvePromise(response.result as T);
      };
      socket.addEventListener("message", listener);
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

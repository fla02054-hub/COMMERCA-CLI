import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Tool } from "./tool-runtime.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export type BrowserObservation = { url: string; title: string; text: string };

function chromeCandidates() {
  return [
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : "",
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe` : "",
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : "",
  ].filter(Boolean);
}

export class BrowserTool {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  private async ensureChrome() {
    const endpoint = process.env.COMMERCA_CHROME_CDP ?? "http://127.0.0.1:9222";
    try { return await chromium.connectOverCDP(endpoint); } catch (firstError) {
      const executable = chromeCandidates()[0] || chromeCandidates()[1] || chromeCandidates()[2];
      if (!executable) throw firstError;
      const profile = `${process.env.USERPROFILE || process.cwd()}\\COMMERCA-CLI\\chrome-agent-profile`;
      await execFileAsync(executable, ["--remote-debugging-port=9222", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check"], { windowsHide: true });
      const deadline = Date.now() + 15_000;
      let lastError: unknown = firstError;
      while (Date.now() < deadline) {
        try { return await chromium.connectOverCDP(endpoint); } catch (error) { lastError = error; await new Promise(r => setTimeout(r, 500)); }
      }
      throw new Error(`Unable to connect to real Google Chrome on CDP 9222: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
  }

  async connect(url?: string): Promise<BrowserObservation> {
    this.browser = await this.ensureChrome();
    this.context = this.browser.contexts()[0] ?? await this.browser.newContext();
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    if (url) {
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    }
    return this.observe();
  }

  async observe(): Promise<BrowserObservation> {
    if (!this.page) throw new Error("Chrome is not connected.");
    return { url: this.page.url(), title: await this.page.title(), text: (await this.page.locator("body").innerText()).slice(0, 30_000) };
  }

  async close(): Promise<void> { await this.browser?.close(); this.browser = undefined; this.context = undefined; this.page = undefined; }
}

export const browserTool: Tool = {
  name: "browser",
  description: "Use the real Google Chrome installed on the user's Windows machine. Start it with a dedicated automation profile when necessary, then open and inspect web pages.",
  async run(input) {
    const value = input as { action?: "open" | "observe" | "close"; url?: string };
    const browser = new BrowserTool();
    if (value.action === "observe") return browser.observe();
    if (value.action === "close") return browser.close();
    return browser.connect(value.url);
  },
};

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Tool } from "./tool-runtime.js";
import path from "node:path";
import os from "node:os";

export type BrowserObservation = { url: string; title: string; text: string };

export class BrowserTool {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  async open(url: string): Promise<BrowserObservation> {
    const chromeUserDataDir = path.join(os.homedir(), "COMMERCA-CLI", "chrome-agent-profile");
    this.context ??= await chromium.launchPersistentContext(chromeUserDataDir, {
      channel: "chrome",
      headless: false,
      viewport: null,
      args: ["--start-maximized"],
    });
    this.page ??= this.context.pages()[0] ?? await this.context.newPage();
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    return this.observe();
  }

  async observe(): Promise<BrowserObservation> {
    if (!this.page) throw new Error("Browser is not open.");
    return { url: this.page.url(), title: await this.page.title(), text: (await this.page.locator("body").innerText()).slice(0, 30_000) };
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
    this.page = undefined;
  }
}

export const browserTool: Tool = {
  name: "browser",
  description: "Open and inspect a real installed Google Chrome browser using a dedicated persistent agent profile.",
  async run(input) {
    const value = input as { action?: "open" | "observe" | "close"; url?: string };
    const browser = new BrowserTool();
    if (value.action === "observe") return browser.observe();
    if (value.action === "close") return browser.close();
    if (!value.url) throw new Error("browser.open requires a URL");
    return browser.open(value.url);
  },
};

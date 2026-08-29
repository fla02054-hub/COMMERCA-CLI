import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Tool } from "./tool-runtime.js";

export type BrowserObservation = { url: string; title: string; text: string };

export class BrowserTool {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  async connect(url?: string): Promise<BrowserObservation> {
    const endpoint = process.env.COMMERCA_CHROME_CDP ?? "http://127.0.0.1:9222";
    this.browser = await chromium.connectOverCDP(endpoint);
    this.context = this.browser.contexts()[0];
    if (!this.context) throw new Error("No Chrome context is available.");
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    if (url) {
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    }
    return this.observe();
  }

  async observe(): Promise<BrowserObservation> {
    if (!this.page) throw new Error("Chrome is not connected. Start Chrome with remote debugging first.");
    return { url: this.page.url(), title: await this.page.title(), text: (await this.page.locator("body").innerText()).slice(0, 30_000) };
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.context = undefined;
    this.page = undefined;
  }
}

export const browserTool: Tool = {
  name: "browser",
  description: "Connect to the user's already-running Google Chrome through CDP and control the existing browser session.",
  async run(input) {
    const value = input as { action?: "open" | "observe" | "close"; url?: string };
    const browser = new BrowserTool();
    if (value.action === "observe") return browser.observe();
    if (value.action === "close") return browser.close();
    return browser.connect(value.url);
  },
};

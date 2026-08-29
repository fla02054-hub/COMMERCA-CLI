import { chromium, type Browser, type Page } from "playwright";
import type { Tool } from "./tool-runtime.js";

export type BrowserObservation = {
  url: string;
  title: string;
  text: string;
};

export class BrowserTool {
  private browser?: Browser;
  private page?: Page;

  async open(url: string): Promise<BrowserObservation> {
    this.browser ??= await chromium.launch({ headless: false });
    this.page ??= await this.browser.newPage();
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    return this.observe();
  }

  async observe(): Promise<BrowserObservation> {
    if (!this.page) throw new Error("Browser is not open.");
    return {
      url: this.page.url(),
      title: await this.page.title(),
      text: (await this.page.locator("body").innerText()).slice(0, 30_000),
    };
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
  }
}

export const browserTool: Tool = {
  name: "browser",
  description: "Open a visible browser, inspect the current page, and return page content.",
  async run(input) {
    const value = input as { action?: "open" | "observe" | "close"; url?: string };
    const browser = new BrowserTool();
    if (value.action === "observe") return browser.observe();
    if (value.action === "close") return browser.close();
    if (!value.url) throw new Error("browser.open requires a URL");
    return browser.open(value.url);
  },
};

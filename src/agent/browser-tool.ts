import { chromium, type Browser, type Page } from "playwright";
import type { Tool } from "./tool-runtime.js";

export type BrowserObservation = {
  url: string;
  title: string;
  text: string;
};

class BrowserToolController {
  private browser?: Browser;
  private page?: Page;

  async run(input: unknown): Promise<BrowserObservation | void> {
    const value = input as { action?: "open" | "observe" | "close"; url?: string };

    if (value.action === "close") {
      await this.browser?.close();
      this.browser = undefined;
      this.page = undefined;
      return;
    }

    if (value.action === "observe") return this.observe();
    if (!value.url) throw new Error("browser.open requires a URL");

    this.browser ??= await chromium.launch({ headless: false });
    this.page ??= await this.browser.newPage({ viewport: { width: 1440, height: 900 } });
    await this.page.goto(value.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    return this.observe();
  }

  private async observe(): Promise<BrowserObservation> {
    if (!this.page) throw new Error("Browser is not open.");
    return {
      url: this.page.url(),
      title: await this.page.title(),
      text: (await this.page.locator("body").innerText()).slice(0, 30_000),
    };
  }
}

const controller = new BrowserToolController();

export const browserTool: Tool = {
  name: "browser",
  description: "Open a real visible Chromium browser, inspect pages, and keep the browser session available to the agent.",
  run: (input) => controller.run(input),
};

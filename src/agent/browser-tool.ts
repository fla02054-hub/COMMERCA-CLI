import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Tool } from "./tool-runtime.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export type BrowserObservation = { url: string; title: string; text: string };
function chromeCandidates() { return [process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : "", process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe` : "", process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : ""].filter(Boolean); }
export class BrowserTool {
  private browser?: Browser; private context?: BrowserContext; private page?: Page;
  private async ensureChrome() {
    const endpoint = process.env.COMMERCA_CHROME_CDP ?? "http://127.0.0.1:9222";
    try { return await chromium.connectOverCDP(endpoint); } catch (firstError) {
      const executable = chromeCandidates()[0] || chromeCandidates()[1] || chromeCandidates()[2]; if (!executable) throw firstError;
      const profile = `${process.env.USERPROFILE || process.cwd()}\\COMMERCA-CLI\\chrome-agent-profile`;
      await execFileAsync(executable, ["--remote-debugging-port=9222", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check"], { windowsHide: true });
      const deadline = Date.now() + 15_000; let lastError: unknown = firstError;
      while (Date.now() < deadline) { try { return await chromium.connectOverCDP(endpoint); } catch (error) { lastError = error; await new Promise(r => setTimeout(r, 500)); } }
      throw new Error(`Unable to connect to real Google Chrome on CDP 9222: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
  }
  private async ready() { if (!this.page) await this.connect(); if (!this.page) throw new Error("Chrome is not connected."); return this.page; }
  async connect(url?: string): Promise<BrowserObservation> {
    this.browser = await this.ensureChrome(); this.context = this.browser.contexts()[0] ?? await this.browser.newContext(); this.page = this.context.pages()[0] ?? await this.context.newPage();
    if (url) { await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }); await this.page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined); }
    return this.observe();
  }
  async observe(): Promise<BrowserObservation> { const page = await this.ready(); return { url: page.url(), title: await page.title(), text: (await page.locator("body").innerText()).slice(0, 30_000) }; }
  async click(selector: string) { const page = await this.ready(); await page.locator(selector).first().click({ timeout: 15_000 }); return this.observe(); }
  async type(selector: string, text: string, clear = true) { const page = await this.ready(); const loc = page.locator(selector).first(); if (clear) await loc.fill(""); await loc.fill(text); return this.observe(); }
  async press(selector: string, key: string) { const page = await this.ready(); await page.locator(selector).first().press(key); return this.observe(); }
  async scroll(amount = 800) { const page = await this.ready(); await page.mouse.wheel(0, amount); await page.waitForTimeout(500); return this.observe(); }
  async find(text: string) { const page = await this.ready(); const matches = await page.getByText(text, { exact: false }).all(); return { count: matches.length, text, url: page.url() }; }
  async extract(selector?: string) { const page = await this.ready(); const loc = selector ? page.locator(selector) : page.locator("body"); return (await loc.innerText()).slice(0, 30_000); }
  async close() { await this.browser?.close(); this.browser = undefined; this.context = undefined; this.page = undefined; }
}
export const browserTool: Tool = {
  name: "browser",
  description: "Control the real Google Chrome on Windows. Actions: open, observe, click, type, press, scroll, find, extract, close. Prefer visible text or robust CSS selectors; never claim success without observing the result.",
  async run(input) {
    const value = input as { action?: string; url?: string; selector?: string; text?: string; key?: string; amount?: number; clear?: boolean };
    const browser = new BrowserTool();
    switch (value.action) {
      case "open": return browser.connect(value.url);
      case "observe": return browser.observe();
      case "click": if (!value.selector) throw new Error("browser click requires selector"); return browser.click(value.selector);
      case "type": if (!value.selector) throw new Error("browser type requires selector"); return browser.type(value.selector, value.text ?? "", value.clear !== false);
      case "press": if (!value.selector) throw new Error("browser press requires selector"); return browser.press(value.selector, value.key ?? "Enter");
      case "scroll": return browser.scroll(value.amount ?? 800);
      case "find": return browser.find(value.text ?? "");
      case "extract": return browser.extract(value.selector);
      case "close": return browser.close();
      default: return browser.connect(value.url);
    }
  },
};

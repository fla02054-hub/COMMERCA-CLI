import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { ACCOUNT_SERVICES, type AccountRecord, type AccountService } from "./types.js";

const ROOT = process.env.COMMERCA_ACCOUNT_ROOT || join(homedir(), ".commerca", "accounts");
const REGISTRY = join(ROOT, "accounts.json");

function ensureRoot() {
  mkdirSync(ROOT, { recursive: true });
}

function profileDir(service: AccountService) {
  const dir = join(ROOT, service);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readRegistry(): AccountRecord[] {
  ensureRoot();
  if (!existsSync(REGISTRY)) return [];
  try {
    const value = JSON.parse(readFileSync(REGISTRY, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeRegistry(records: AccountRecord[]) {
  ensureRoot();
  writeFileSync(REGISTRY, JSON.stringify(records, null, 2), { encoding: "utf8", mode: 0o600 });
}

function chromeExecutable(): string | undefined {
  const candidates = [
    process.env.COMMERCA_CHROME_PATH,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter((x): x is string => Boolean(x));
  return candidates.find(existsSync);
}

export function listAccounts(): AccountRecord[] {
  return (Object.keys(ACCOUNT_SERVICES) as AccountService[]).map((service) => {
    const saved = readRegistry().find((x) => x.service === service);
    return saved ?? {
      service,
      label: ACCOUNT_SERVICES[service].label,
      status: "NOT_CONNECTED" as const,
      profileDir: profileDir(service),
    };
  });
}

export async function loginAccount(service: AccountService): Promise<void> {
  const executablePath = chromeExecutable();
  if (!executablePath) {
    throw new Error("Google Chrome was not found. Install Chrome or set COMMERCA_CHROME_PATH to chrome.exe.");
  }

  const dir = profileDir(service);
  console.log(`[ACCOUNT] Opening ${ACCOUNT_SERVICES[service].label}`);
  console.log(`[ACCOUNT] Login manually in the browser. COMMERCA never asks for your password.`);

  const context: BrowserContext = await chromium.launchPersistentContext(dir, {
    headless: false,
    executablePath,
    viewport: null,
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(ACCOUNT_SERVICES[service].url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);

  console.log("[ACCOUNT] Finish login/verification in the opened Chrome window.");
  console.log("[ACCOUNT] When the account is visibly logged in, return here and press ENTER.");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });

  const records = listAccounts().filter((x) => x.service !== service);
  records.push({
    service,
    label: ACCOUNT_SERVICES[service].label,
    status: "CONNECTED",
    profileDir: dir,
    lastLoginAt: new Date().toISOString(),
  });
  writeRegistry(records);
  await context.close();
  console.log(`[ACCOUNT] ${ACCOUNT_SERVICES[service].label}: CONNECTED`);
}

export async function openAccount(service: AccountService): Promise<void> {
  const record = listAccounts().find((x) => x.service === service);
  if (!record || record.status !== "CONNECTED") {
    throw new Error(`${ACCOUNT_SERVICES[service].label} is not connected. Run: account login ${service}`);
  }
  const executablePath = chromeExecutable();
  if (!executablePath) throw new Error("Google Chrome was not found. Set COMMERCA_CHROME_PATH if needed.");
  const context = await chromium.launchPersistentContext(record.profileDir, {
    headless: false,
    executablePath,
    viewport: null,
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(ACCOUNT_SERVICES[service].url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);
  console.log(`[ACCOUNT] ${ACCOUNT_SERVICES[service].label} opened with its saved browser profile.`);
}

export function accountService(value: string | undefined): AccountService {
  if (!value || !(value in ACCOUNT_SERVICES)) {
    throw new Error(`Unknown account service. Use: ${Object.keys(ACCOUNT_SERVICES).join(", ")}`);
  }
  return value as AccountService;
}

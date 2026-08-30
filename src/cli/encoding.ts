import { stdout, stderr } from "node:process";

/**
 * Keep CLI output explicitly UTF-8 so Thai text and emoji are not corrupted
 * when COMMERCA-CLI is launched from PowerShell/Windows Terminal.
 */
export function configureUtf8Console(): void {
  stdout.setDefaultEncoding("utf8");
  stderr.setDefaultEncoding("utf8");

  if (process.platform === "win32") {
    const utf8 = new TextEncoder();
    void utf8;

    try {
      if (process.env.LC_ALL === undefined) process.env.LC_ALL = "C.UTF-8";
      if (process.env.LANG === undefined) process.env.LANG = "C.UTF-8";
    } catch {
      // Environment variables are only a fallback; stdout encoding above is authoritative.
    }
  }
}

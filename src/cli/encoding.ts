import { execFileSync } from "node:child_process";
import { stdout, stderr } from "node:process";

/**
 * Force UTF-8 for COMMERCA-CLI on Windows consoles and PowerShell.
 * This changes the attached console code page as well as Node's streams,
 * preventing Thai/emoji mojibake such as "α╕..." and "≡ƒ...".
 */
export function configureUtf8Console(): void {
  stdout.setDefaultEncoding("utf8");
  stderr.setDefaultEncoding("utf8");

  if (process.platform !== "win32") return;

  try {
    // The code page belongs to the attached Windows console, so changing it
    // through cmd.exe also affects this Node process.
    execFileSync("cmd.exe", ["/d", "/s", "/c", "chcp 65001 > nul"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // Continue with UTF-8 Node streams when no Windows console is attached.
  }

  try {
    process.env.LC_ALL ??= "C.UTF-8";
    process.env.LANG ??= "C.UTF-8";
  } catch {
    // Environment variables are only a fallback.
  }
}

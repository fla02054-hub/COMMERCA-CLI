import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

test("CLI help loads without ReferenceError and exposes the job approval command", async () => {
  const { stdout } = await exec(process.execPath, ["--import", "tsx", "src/cli/index.ts", "--help"]);
  assert.match(stdout, /COMMERCA-CLI/);
  assert.match(stdout, /workflow run/);
  assert.match(stdout, /workflow approve/);
});

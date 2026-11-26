import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

test("worker Deno : check, lint et scénarios locaux sans réseau réel", async () => {
  const { stdout, stderr } = await execFileAsync("npm", ["run", "test:worker"], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = stdout + stderr;
  assert.match(output, /deno check|Check supabase\/functions\/notification-worker\/(index\.ts|deno-scenarios\.ts)/i);
  assert.match(output, /Checked 2 files/);
  assert.match(output, /[0-9]+ passed \| 0 failed/);
  assert.doesNotMatch(output, /error\[|TS[0-9]+|Module not found|PermissionDenied/i);
});

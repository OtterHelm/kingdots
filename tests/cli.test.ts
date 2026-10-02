import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run, killTree, delay } from "../src/process.js";
test("CLI start, status and stop operate the owned background service", async () => {
  const root = await mkdtemp(join(tmpdir(), "kingdots-cli-"));
  const args = [process.execPath, "--import", "tsx", resolve("src/cli.ts")];
  const command = (action: string) =>
    run([...args, action, "--data-dir", root], process.cwd(), 30_000);
  let ownedPid: number | undefined;
  try {
    const start = await command("start");
    assert.equal(start.exitCode, 0, start.stderr);
    ownedPid = JSON.parse(
      await readFile(join(root, "instance.json"), "utf8"),
    ).pid;
    const status = await command("status");
    assert.equal(JSON.parse(status.stdout).online, true);
    const stopped = await command("stop");
    assert.equal(stopped.exitCode, 0, stopped.stderr);
    assert.equal(JSON.parse(stopped.stdout).stopping, true);
    let offline = false;
    for (let i = 0; i < 50; i++) {
      if ((await command("status")).stdout.includes("offline")) {
        offline = true;
        break;
      }
      await delay(100);
    }
    assert.equal(offline, true);
    ownedPid = undefined;
  } finally {
    if (ownedPid) await killTree(ownedPid);
    if (!resolve(root).startsWith(resolve(tmpdir(), "kingdots-cli-")))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});

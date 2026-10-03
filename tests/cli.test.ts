import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run, killTree, delay } from "../src/process.js";
import { defaultDataDir } from "../src/runtime.js";
import { spawn } from "node:child_process";

test("malformed connection input is rejected without printing its contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "kingdots-stdin-"));
  const privateInput = "fixture-sensitive-configuration-value";
  try {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("src/cli.ts"),
        "relay-configure",
        "--data-dir",
        root,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    const done = new Promise<number | null>((accept, reject) => {
      child.once("error", reject);
      child.once("close", accept);
    });
    child.stdin.end(privateInput + "\n");
    assert.equal(await done, 1);
    assert.match(output, /Invalid connection JSON/);
    assert.ok(!output.includes(privateInput));
    const removed = await run(
      [
        process.execPath,
        "--import",
        "tsx",
        resolve("src/cli.ts"),
        "install-plugin",
        "--data-dir",
        root,
      ],
      process.cwd(),
      10000,
    );
    assert.equal(removed.exitCode, 1);
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir(), "kingdots-stdin-")))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("default storage preserves existing preview data and respects explicit paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "kingdots-path-"));
  const originalLocal = process.env.LOCALAPPDATA;
  const originalData = process.env.KINGDOTS_HOME;
  try {
    process.env.LOCALAPPDATA = root;
    delete process.env.KINGDOTS_HOME;
    const current = join(root, "kingdots");
    const legacy = join(root, "DotsKing");
    assert.equal(defaultDataDir(), current);
    await mkdir(legacy);
    assert.equal(defaultDataDir(), legacy);
    await mkdir(current);
    assert.equal(defaultDataDir(), current);
    process.env.KINGDOTS_HOME = join(root, "explicit");
    assert.equal(defaultDataDir(), process.env.KINGDOTS_HOME);
  } finally {
    if (originalLocal === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = originalLocal;
    if (originalData === undefined) delete process.env.KINGDOTS_HOME;
    else process.env.KINGDOTS_HOME = originalData;
    if (!resolve(root).startsWith(resolve(tmpdir(), "kingdots-path-")))
      throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

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

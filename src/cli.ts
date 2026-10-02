#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { mkdir, readFile, writeFile, unlink, open } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { defaultDataDir, runtime } from "./runtime.js";
import { Vault } from "./vault.js";
import { buildServer } from "./server.js";
import { delay } from "./process.js";
import { installLocalPlugin } from "./install-plugin.js";

const args = process.argv.slice(2);
const dataIndex = args.indexOf("--data-dir");
const dataDir = resolve(
  dataIndex >= 0 ? args[dataIndex + 1] : defaultDataDir(),
);
const instanceFile = join(dataDir, "instance.json");
const lockFile = join(dataDir, "service.lock");
interface Instance {
  pid: number;
  url: string;
  id: string;
  createdAt: string;
}
async function instance(): Promise<Instance | null> {
  try {
    const item = JSON.parse(await readFile(instanceFile, "utf8")) as Instance;
    const result = await fetch(item.url + "/healthz", {
      signal: AbortSignal.timeout(1000),
    });
    if (result.ok && ((await result.json()) as any).service === "kingdots")
      return item;
  } catch {}
  return null;
}
async function api(path: string, body?: unknown, mcp = false) {
  const current = await instance();
  if (!current) throw new Error("DotsKing is offline. Run kingdots start.");
  const vault = await Vault.open(join(dataDir, "secrets.bin"));
  const result = await fetch(current.url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: "Bearer " + vault.get(mcp ? "mcpToken" : "uiToken"),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await result.json();
  if (!result.ok)
    throw new Error((value as any).error ?? `HTTP ${result.status}`);
  return value;
}
async function startService() {
  await mkdir(dataDir, { recursive: true });
  const current = await instance();
  if (current) return current;
  const log = await open(join(dataDir, "service.log"), "a");
  const source = process.argv[1];
  const isTypeScript = source.endsWith(".ts");
  const child = spawn(
    process.execPath,
    [
      ...(isTypeScript ? ["--import", "tsx"] : []),
      source,
      "serve",
      "--data-dir",
      dataDir,
    ],
    {
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log.fd, log.fd],
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    },
  );
  child.unref();
  await log.close();
  for (let i = 0; i < 100; i++) {
    const result = await instance();
    if (result) return result;
    await delay(250);
  }
  throw new Error(
    "Service did not start. Inspect " + join(dataDir, "service.log"),
  );
}
async function serve() {
  await mkdir(dataDir, { recursive: true });
  try {
    const file = await open(lockFile, "wx");
    await file.writeFile(JSON.stringify({ pid: process.pid }));
    await file.close();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    try {
      process.kill(lock.pid, 0);
      throw new Error("Another DotsKing service is running");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await unlink(lockFile);
    const file = await open(lockFile, "wx");
    await file.writeFile(JSON.stringify({ pid: process.pid }));
    await file.close();
  }
  let rt: Awaited<ReturnType<typeof runtime>> | undefined;
  let app: ReturnType<typeof buildServer> | undefined;
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app?.close();
    await rt?.close();
    await unlink(instanceFile).catch(() => {});
    await unlink(lockFile).catch(() => {});
  };
  try {
    rt = await runtime(dataDir);
    app = buildServer(
      rt.manager,
      rt.events,
      { ui: rt.vault.get("uiToken")!, mcp: rt.vault.get("mcpToken")! },
      {
        webDir: fileURLToPath(new URL("../web-dist", import.meta.url)),
        onShutdown: () => {
          void close();
        },
      },
    );
    const url = await app.listen({
      host: "127.0.0.1",
      port: Number(process.env.KINGDOTS_PORT ?? 0),
    });
    await writeFile(
      instanceFile,
      JSON.stringify({
        pid: process.pid,
        url,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      } satisfies Instance),
      { mode: 0o600 },
    );
    rt.events.start();
    process.once("SIGINT", () => {
      void close();
    });
    process.once("SIGTERM", () => {
      void close();
    });
  } catch (e) {
    await close();
    throw e;
  }
}
async function main() {
  switch (args[0] ?? "help") {
    case "serve":
      await serve();
      break;
    case "start": {
      const result = await startService();
      process.stdout.write(
        `DotsKing running at ${result.url}\nRun kingdots open to authenticate the dashboard.\n`,
      );
      break;
    }
    case "stop":
      process.stdout.write(
        JSON.stringify(await api("/api/shutdown", {})) + "\n",
      );
      break;
    case "status": {
      const result = await instance();
      process.stdout.write(
        result
          ? JSON.stringify(
              {
                online: true,
                ...result,
                ...((await api("/api/status")) as any),
              },
              null,
              2,
            ) + "\n"
          : "DotsKing is offline.\n",
      );
      break;
    }
    case "doctor": {
      if (await instance())
        process.stdout.write(
          JSON.stringify(await api("/api/capabilities"), null, 2) + "\n",
        );
      else {
        const rt = await runtime(dataDir);
        try {
          process.stdout.write(
            JSON.stringify(await rt.manager.capabilities(), null, 2) + "\n",
          );
        } finally {
          await rt.close();
        }
      }
      break;
    }
    case "open": {
      const result = await startService();
      const vault = await Vault.open(join(dataDir, "secrets.bin"));
      const url = result.url + "/#token=" + vault.get("uiToken");
      if (process.platform === "win32") {
        const child = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath ([Console]::In.ReadToEnd()) -WindowStyle Hidden",
          ],
          { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
        );
        child.stdin.end(url);
      } else
        spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], {
          stdio: "ignore",
          detached: true,
        }).unref();
      process.stdout.write("Opened the local DotsKing dashboard.\n");
      break;
    }
    case "mcp": {
      await startService();
      const current = (await instance())!;
      const vault = await Vault.open(join(dataDir, "secrets.bin"));
      const lines = createInterface({ input: process.stdin });
      const pending = new Set<Promise<void>>();
      const forward = async (line: string) => {
        try {
          const input = JSON.parse(line);
          const response = await fetch(current.url + "/mcp", {
            method: "POST",
            headers: {
              authorization: "Bearer " + vault.get("mcpToken"),
              "content-type": "application/json",
            },
            body: line,
          });
          if (input.id !== undefined) {
            const result = await response.json();
            process.stdout.write(JSON.stringify(result) + "\n");
          }
        } catch (e) {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: (e as Error).message },
            }) + "\n",
          );
        }
      };
      for await (const line of lines) {
        const job = forward(line);
        pending.add(job);
        void job.finally(() => pending.delete(job));
      }
      await Promise.allSettled([...pending]);
      break;
    }
    case "tunnel-guide":
      process.stdout.write(
        "Secure MCP Tunnel is disabled under the current no-API-billing requirement. Use kingdots install-plugin for a local stdio connection without a Platform API key. Actual Dots follow-up still requires end-to-end verification. See docs/dots-connection.md.\n",
      );
      break;
    case "install-plugin":
      process.stdout.write(
        JSON.stringify(await installLocalPlugin(dataDir), null, 2) + "\n",
      );
      break;
    default:
      process.stdout.write(
        "DotsKing · kingdots start | stop | status | doctor | open | mcp | install-plugin | tunnel-guide\nOptions: --data-dir PATH; KINGDOTS_HOME; KINGDOTS_PORT\n",
      );
  }
}
await main().catch((e) => {
  process.stderr.write((e as Error).message + "\n");
  process.exitCode = 1;
});

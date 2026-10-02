import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";

export function executable(name: string): string {
  if (process.platform !== "win32" || /[\\/]/.test(name)) return name;
  // npm .cmd shims are not executables for shell:false; use their JS entrypoints instead.
  const dirs = (process.env.PATH ?? "").split(delimiter);
  for (const dir of dirs)
    for (const ext of [".exe", ".cmd"]) {
      const file = join(dir, name + ext);
      if (existsSync(file)) return file;
    }
  return name;
}
export function spawnTool(
  name: string,
  args: string[],
  options: Parameters<typeof spawn>[2] = {},
) {
  const file = executable(name);
  if (process.platform === "win32" && file.endsWith(".cmd")) {
    const modules = join(file, "..", "node_modules");
    const entry =
      name === "codex"
        ? join(modules, "@openai", "codex", "bin", "codex.js")
        : name === "claude"
          ? join(modules, "@anthropic-ai", "claude-code", "cli.js")
          : name === "npm"
            ? join(modules, "npm", "bin", "npm-cli.js")
            : null;
    if (entry && existsSync(entry))
      return spawn(process.execPath, [entry, ...args], {
        ...options,
        shell: false,
        windowsHide: true,
      });
    throw new Error(
      `Cannot safely execute ${name} .cmd shim; configure a native executable or JS entrypoint.`,
    );
  }
  return spawn(file, args, { ...options, shell: false, windowsHide: true });
}
export async function run(
  argv: string[],
  cwd: string,
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawnTool>;
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    try {
      child = spawnTool(argv[0], argv.slice(1), {
        cwd,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      reject(e);
      return;
    }
    let stdout = "",
      stderr = "",
      finished = false;
    const limit = 2_000_000;
    child.stdout?.on("data", (c) => {
      stdout = (stdout + c.toString()).slice(-limit);
    });
    child.stderr?.on("data", (c) => {
      stderr = (stderr + c.toString()).slice(-limit);
    });
    const stop = () => {
      stderr += "\nExecution interrupted or timed out.";
      void killTree(child.pid);
    };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener("abort", stop, { once: true });
    child.once("error", (e) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        reject(e);
      }
    });
    child.once("close", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        resolve({ exitCode: code, stdout, stderr });
      }
    });
    if (signal?.aborted) stop();
  });
}
export async function killTree(pid?: number) {
  if (!pid) return;
  if (process.platform === "win32") {
    await promisify(execFile)(
      "taskkill.exe",
      ["/pid", String(pid), "/t", "/f"],
      { windowsHide: true },
    ).catch(() => {});
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}
export const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

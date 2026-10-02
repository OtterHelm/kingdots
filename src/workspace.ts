import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  readlink,
  realpath,
  copyFile,
  symlink,
} from "node:fs/promises";
import { join, resolve, relative, dirname, isAbsolute } from "node:path";
import { spawnTool } from "./process.js";
import { DomainError, type Task } from "./domain.js";

const exec = promisify(execFile);
export async function git(cwd: string, args: string[]) {
  return (
    await exec("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
    })
  ).stdout;
}
export function inside(root: string, path: string) {
  const r = relative(root, path);
  return (
    r === "" ||
    (!r.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) &&
      r !== ".." &&
      !isAbsolute(r))
  );
}
export async function safeFile(root: string, name: string) {
  const candidate = resolve(root, name);
  if (!inside(root, candidate))
    throw new DomainError("outside_workspace", "Path leaves the worktree");
  const actual = await realpath(candidate);
  if (!inside(await realpath(root), actual))
    throw new DomainError("outside_workspace", "Symlink leaves the worktree");
  return actual;
}
export async function scopedPath(root: string, path: string) {
  const candidate = resolve(root, path);
  if (!inside(root, candidate))
    throw new DomainError("outside_workspace", "Path leaves the worktree");
  let current = candidate;
  const tail: string[] = [];
  while (true) {
    try {
      const actual = resolve(await realpath(current), ...tail);
      if (!inside(await realpath(root), actual))
        throw new DomainError(
          "outside_workspace",
          "Symlink leaves the worktree",
        );
      return actual;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const parent = dirname(current);
      if (parent === current) throw e;
      tail.unshift(relative(parent, current));
      current = parent;
    }
  }
}
export async function fileList(cwd: string) {
  return [
    ...new Set(
      (
        await git(cwd, [
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ])
      )
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
}
export async function fingerprint(cwd: string): Promise<string> {
  const hash = createHash("sha256");
  for (const path of await fileList(cwd)) {
    hash.update(path + "\0");
    try {
      const stat = await lstat(join(cwd, path));
      hash.update(String(stat.mode));
      if (stat.isSymbolicLink()) hash.update(await readlink(join(cwd, path)));
      else if (stat.isFile()) hash.update(await readFile(join(cwd, path)));
      else hash.update("directory");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      hash.update("deleted");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}
export async function prepareWorktree(task: Task, dataDir: string) {
  const project = await realpath(task.project);
  const root = (await git(project, ["rev-parse", "--show-toplevel"])).trim();
  if ((await realpath(root)) !== project)
    throw new DomainError(
      "project_root",
      "Select the repository root as the project",
    );
  const ref = task.baseRef ?? "HEAD";
  if (ref.startsWith("-"))
    throw new DomainError("invalid_ref", "Invalid base reference");
  const baseCommit = (
    await git(project, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      ref + "^{commit}",
    ])
  ).trim();
  const currentCommit = (await git(project, ["rev-parse", "HEAD"])).trim();
  const dirty = (await git(project, ["status", "--porcelain"])).length > 0;
  if (task.includeDirty && dirty && baseCommit !== currentCommit)
    throw new DomainError(
      "dirty_base",
      "Dirty changes can only be copied onto the current HEAD",
    );
  if (
    (await git(project, ["ls-files", "--stage"]))
      .split("\n")
      .some((line) => line.startsWith("160000 "))
  )
    throw new DomainError(
      "submodules",
      "Submodule worktrees need explicit setup and are not supported in this release",
    );
  const sourceFingerprint = await fingerprint(project);
  const patch = task.includeDirty
    ? await git(project, ["diff", "--binary", "HEAD", "--"])
    : "";
  const untracked = task.includeDirty
    ? (await git(project, ["ls-files", "-z", "--others", "--exclude-standard"]))
        .split("\0")
        .filter(Boolean)
    : [];
  const branch = "kingdots/" + task.id;
  const worktree = resolve(dataDir, "worktrees", task.id);
  await mkdir(dirname(worktree), { recursive: true });
  await git(project, ["worktree", "add", "-b", branch, worktree, baseCommit]);
  if (patch)
    await new Promise<void>((accept, reject) => {
      const child = spawnTool(
        "git",
        ["apply", "--binary", "--whitespace=nowarn", "-"],
        { cwd: worktree, stdio: ["pipe", "ignore", "pipe"] },
      );
      let error = "";
      child.stderr?.on("data", (c) => (error += c.toString()));
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0 ? accept() : reject(new Error(error)),
      );
      child.stdin?.end(patch);
    });
  for (const path of untracked) {
    const from = join(project, path),
      to = resolve(worktree, path);
    if (!inside(worktree, to))
      throw new DomainError("outside_workspace", "Unsafe untracked path");
    const stat = await lstat(from);
    await mkdir(dirname(to), { recursive: true });
    if (stat.isSymbolicLink()) {
      await safeFile(project, path);
      await symlink(await readlink(from), to);
    } else if (stat.isFile()) await copyFile(from, to);
  }
  if ((await fingerprint(project)) !== sourceFingerprint)
    throw new DomainError(
      "source_changed",
      `Project changed while preparing the worktree. Retained worktree: ${worktree}`,
    );
  // Store the original scope baseline independently of the worker's mutable Git index.
  const original = await fileList(worktree);
  const baseline: Record<string, string> = {};
  for (const path of original)
    try {
      const stat = await lstat(join(worktree, path));
      baseline[path] = createHash("sha256")
        .update(
          stat.isSymbolicLink()
            ? await readlink(join(worktree, path))
            : stat.isFile()
              ? await readFile(join(worktree, path))
              : "directory",
        )
        .digest("hex");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  await writeFile(
    join(dataDir, "worktrees", task.id + ".baseline.json"),
    JSON.stringify(baseline),
    { mode: 0o600 },
  );
  return {
    project,
    worktree,
    branch,
    baseCommit,
    baselineFingerprint: await fingerprint(worktree),
  };
}
export async function changedPaths(task: Task, dataDir: string) {
  const baseline = JSON.parse(
    await readFile(
      join(dataDir, "worktrees", task.id + ".baseline.json"),
      "utf8",
    ),
  ) as Record<string, string>;
  const paths = new Set([
    ...Object.keys(baseline),
    ...(await fileList(task.worktree!)),
  ]);
  const changed: string[] = [];
  for (const path of paths) {
    let hash: string | undefined;
    try {
      const stat = await lstat(join(task.worktree!, path));
      hash = createHash("sha256")
        .update(
          stat.isSymbolicLink()
            ? await readlink(join(task.worktree!, path))
            : stat.isFile()
              ? await readFile(join(task.worktree!, path))
              : "directory",
        )
        .digest("hex");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (baseline[path] !== hash) changed.push(path);
  }
  return changed;
}
export function allowedPath(path: string, patterns: string[]) {
  return patterns.some((pattern) => {
    const p = pattern.replaceAll("\\", "/");
    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll("**", "\u0000")
      .replaceAll("*", "[^/]*")
      .replaceAll("\u0000", ".*");
    return new RegExp("^" + escaped + "$").test(path.replaceAll("\\", "/"));
  });
}

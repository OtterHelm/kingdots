import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFile, lstat, readlink } from "node:fs/promises";
import { join } from "node:path";
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

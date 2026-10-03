import { readFile, realpath, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(fileURLToPath(new URL("..", import.meta.url)));
if (
  JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).name !==
  "kingdots"
)
  throw new Error("Unexpected build root");
for (const name of ["dist", "web-dist"]) {
  const target = resolve(root, name);
  let actual;
  try {
    actual = await realpath(target);
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  if (actual !== target || dirname(actual) !== root)
    throw new Error("Build target leaves the repository");
  await rm(target, { recursive: true, force: true });
}

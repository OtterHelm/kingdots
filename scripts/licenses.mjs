import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const sections = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue;
  const directory = resolve(path);
  try {
    const pkg = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    const files = (await readdir(directory)).filter((name) =>
      /^(license|licence|copying|notice)(\.|$)/i.test(name),
    );
    let text = "";
    for (const file of files) {
      try {
        text +=
          "\n" + file + "\n" + (await readFile(join(directory, file), "utf8"));
      } catch {}
    }
    sections.push(
      `## ${pkg.name} ${pkg.version}\n\nDeclared license: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? "See package notices")}\n\n${text ? "```text\n" + text.trim().replace(/[ \t]+$/gm, "") + "\n```" : "Refer to the separately installed package and its published license."}\n`,
    );
  } catch {}
}
await mkdir("docs", { recursive: true });
await writeFile(
  "docs/third-party-notices.md",
  "# Third-party notices\n\nGenerated from the locked production dependency inventory. Dependencies retain their own licenses. Provider account terms and separately installed executables are outside this package.\n\n" +
    sections.join("\n"),
);
console.log(
  `Recorded notices for ${sections.length} installed production packages.`,
);

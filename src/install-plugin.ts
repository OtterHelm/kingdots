import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.js";

/** Install a local plugin with executable paths for this machine, without a tunnel. */
export async function installLocalPlugin(dataDir: string) {
  const marketplace = join(dataDir, "plugin-marketplace");
  const plugin = join(marketplace, "plugins", "kingdots");
  await mkdir(join(marketplace, ".agents", "plugins"), { recursive: true });
  await cp(
    fileURLToPath(new URL("../plugins/kingdots", import.meta.url)),
    plugin,
    { recursive: true },
  );
  const server = {
    command: process.execPath,
    args: [
      fileURLToPath(new URL("cli.js", import.meta.url)),
      "mcp",
      "--data-dir",
      dataDir,
    ],
  };
  await writeFile(
    join(plugin, ".mcp.json"),
    JSON.stringify({ mcpServers: { kingdots: server } }, null, 2),
  );
  await writeFile(
    join(plugin, "mcp.json"),
    JSON.stringify(
      {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: { kingdots: { type: "stdio", ...server } },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(marketplace, ".agents", "plugins", "marketplace.json"),
    JSON.stringify(
      {
        name: "kingdots-local",
        interface: { displayName: "kingdots local" },
        plugins: [
          {
            name: "kingdots",
            source: { source: "local", path: "./plugins/kingdots" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      },
      null,
      2,
    ),
  );
  for (const argv of [
    ["codex", "plugin", "marketplace", "add", marketplace, "--json"],
    ["codex", "plugin", "add", "kingdots@kingdots-local", "--json"],
  ]) {
    const result = await run(argv, marketplace, 120_000);
    if (result.exitCode !== 0)
      throw new Error(
        result.stderr || result.stdout || "Local plugin installation failed",
      );
  }
  return {
    marketplace,
    plugin,
    selector: "kingdots@kingdots-local",
    connection: "local-stdio",
    apiKeyRequired: false,
    note: "Restart/reload desktop plugin connections and verify the actual Dots path. Local installation is not unattended acceptance.",
  };
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const client = new Client({ name: "kingdots-local-check", version: "0.1.0" });
try {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist/cli.js"), "mcp"],
      stderr: "pipe",
    }),
  );
  const listed = await client.listTools();
  const capabilities = await client.callTool({
    name: "capabilities_list",
    arguments: {},
  });
  if (capabilities.isError)
    throw new Error("Local capability discovery failed");
  const result = {
    passed: true,
    transport: "local-stdio",
    apiKeyRequired: false,
    modelCalls: 0,
    tools: listed.tools.map((t) => t.name),
    capabilities,
    actualDotsWake: "unverified",
    checkedAt: new Date().toISOString(),
  };
  await mkdir(".kingdots/local-connection", { recursive: true });
  await writeFile(
    ".kingdots/local-connection/result.json",
    JSON.stringify(result, null, 2),
  );
  process.stdout.write(
    JSON.stringify({
      passed: true,
      tools: result.tools.length,
      modelCalls: 0,
      actualDotsWake: result.actualDotsWake,
    }) + "\n",
  );
} finally {
  await client.close();
}

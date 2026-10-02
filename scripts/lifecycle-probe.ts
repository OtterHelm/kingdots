import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { CodexAdapter } from "../src/adapters/codex.js";
import type { Task } from "../src/domain.js";
const root = resolve(".kingdots", "lifecycle-probe");
await mkdir(root, { recursive: true });
const trace: unknown[] = [];
const c: any = new CodexAdapter();
const native = c.message.bind(c);
c.message = (m: any) => {
  trace.push({
    direction: "in",
    id: m.id,
    method: m.method,
    threadId: m.params?.threadId,
    turnId: m.params?.turn?.id ?? m.result?.turn?.id,
    status: m.params?.turn?.status ?? m.result?.turn?.status,
    runtime: m.params?.status?.type,
    error: m.error?.message,
  });
  native(m);
};
const rpc = c.rpc.bind(c);
c.rpc = (method: string, params: any, timeout: number) => {
  trace.push({
    direction: "out",
    method,
    threadId: params?.threadId,
    turnId: params?.turnId,
  });
  return rpc(method, params, timeout);
};
try {
  const session = await c.create({
    worktree: root,
    scope: { allowedPaths: ["**"], allowNetwork: false },
  } as Task);
  const result = await c.send(
    session.id,
    "Reply with the single word ready. Make no tool calls or file changes.",
    "probe",
    { worktree: root, scope: { allowNetwork: false } } as Task,
  );
  trace.push({ marker: "send_returned", result });
  const delay = Number(process.argv[2] ?? 0);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  try {
    await c.interrupt(session.id);
    trace.push({ marker: "interrupted" });
  } catch (e) {
    trace.push({ marker: "interrupt_error", message: (e as Error).message });
  }
  trace.push({ marker: "read", session: await c.read(session.id) });
  await new Promise((r) => setTimeout(r, 500));
} finally {
  await c.close();
  await writeFile(join(root, "trace.json"), JSON.stringify(trace, null, 2));
  for (const item of trace)
    if ((item as any).method !== "item/agentMessage/delta")
      process.stdout.write(JSON.stringify(item) + "\n");
}

import { createInterface } from "node:readline";
const send = (v) => process.stdout.write(JSON.stringify(v) + "\n");
let active = false,
  started = false,
  authReads = 0;
const authMode =
  process.argv.find((a) => a.startsWith("--fixture-auth="))?.split("=")[1] ??
  "chatgpt";
createInterface({ input: process.stdin }).on("line", (line) => {
  const r = JSON.parse(line);
  if (r.id === undefined) return;
  const reply = (result) => send({ id: r.id, result });
  switch (r.method) {
    case "initialize":
      reply({});
      break;
    case "account/read":
      authReads++;
      reply({
        account: {
          type:
            authMode === "change"
              ? authReads === 1
                ? "chatgpt"
                : "apiKey"
              : authMode,
        },
        requiresOpenaiAuth: true,
      });
      break;
    case "model/list":
      reply({
        data: [
          { id: "fixture-model", model: "fixture-model", isDefault: true },
        ],
      });
      break;
    case "thread/start":
      reply({
        thread: {
          id: "fixture-thread",
          cwd: process.cwd(),
          status: { type: "idle" },
        },
      });
      break;
    case "turn/start":
      reply({ turn: { id: "fixture-turn", status: "inProgress" } });
      setTimeout(() => {
        started = true;
        active = true;
        send({
          method: "turn/started",
          params: {
            threadId: "fixture-thread",
            turn: { id: "fixture-turn", status: "inProgress" },
          },
        });
      }, 250);
      break;
    case "turn/interrupt":
      if (!started) {
        send({
          id: r.id,
          error: { code: -1, message: "no active turn to interrupt" },
        });
      } else {
        active = false;
        reply({});
        send({
          method: "turn/completed",
          params: {
            threadId: "fixture-thread",
            turn: { id: "fixture-turn", status: "interrupted" },
          },
        });
      }
      break;
    case "turn/steer":
      if (!active)
        send({
          id: r.id,
          error: { code: -1, message: "Steering was sent before startup" },
        });
      else reply({ turnId: "fixture-turn" });
      break;
    case "thread/read":
      reply({
        thread: {
          id: "fixture-thread",
          cwd: process.cwd(),
          status: { type: active ? "active" : "idle" },
        },
      });
      break;
    case "thread/loaded/list":
      reply({ data: ["fixture-thread"] });
      break;
    default:
      reply({});
  }
});

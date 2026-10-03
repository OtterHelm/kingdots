import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
let deferred;
let initialized = false;
createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialized") initialized = true;
  if (request.id === "fixture-permission" && request.error) {
    send({
      id: deferred,
      result: {
        thread: {
          id: "approval-fixture",
          status: { type: "notLoaded" },
          preview: "Permission refused",
        },
      },
    });
    return;
  }
  if (request.id === undefined) return;
  if (["thread/list", "thread/read"].includes(request.method) && !initialized) {
    send({
      id: request.id,
      error: {
        code: -1,
        message: "Client used metadata before initialization",
      },
    });
    return;
  }
  const reply = (result) => send({ id: request.id, result });
  switch (request.method) {
    case "initialize":
      reply({});
      break;
    case "account/read":
      reply({ account: { type: "chatgpt" } });
      break;
    case "thread/list":
      reply({
        data: [
          {
            id: "saved-fixture",
            status: { type: "notLoaded" },
            cwd: "fixture-project",
            preview: "Stored metadata",
          },
        ],
      });
      break;
    case "thread/read":
      if (request.params.threadId === "missing-fixture")
        send({
          id: request.id,
          error: { code: -1, message: "Fixture session not found" },
        });
      else if (request.params.threadId === "approval-fixture") {
        deferred = request.id;
        send({
          id: "fixture-permission",
          method: "item/commandExecution/requestApproval",
          params: {},
        });
      } else
        reply({
          thread: {
            id: request.params.threadId,
            status: {
              type:
                request.params.threadId === "active-fixture"
                  ? "active"
                  : "notLoaded",
            },
            cwd: "fixture-project",
            preview: "Existing metadata",
          },
        });
      break;
    default:
      send({
        id: request.id,
        error: { code: -32601, message: "Fixture permits metadata reads only" },
      });
  }
});

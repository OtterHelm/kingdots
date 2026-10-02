import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Vault } from "../src/vault.js";
import { run } from "../src/process.js";

const data = resolve(".kingdots", "observer-web-check");
await mkdir(data, { recursive: true });
const cli = [process.execPath, resolve("dist/cli.js")];
const start = await run(
  [...cli, "start", "--data-dir", data],
  process.cwd(),
  30_000,
);
if (start.exitCode !== 0) throw new Error(start.stderr);
const instance = JSON.parse(
  await readFile(join(data, "instance.json"), "utf8"),
);
const vault = await Vault.open(join(data, "secrets.bin"));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const failures: string[] = [];
page.on("pageerror", (e) => failures.push(e.message));
try {
  await page.goto(instance.url + "/#token=" + vault.get("uiToken"));
  await page
    .getByRole("heading", { name: "기존 세션 관찰과 관리", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "＋ 기존 세션 등록", exact: true })
    .click();
  await page
    .locator('[name="goal"]')
    .fill("Browser fixture: observe an existing session");
  await page
    .locator('[name="sessions"]')
    .fill(
      JSON.stringify([
        {
          backend: "codex-app",
          sessionId: "browser-fixture-not-a-real-session",
          project: process.cwd(),
          source: "dots_host",
        },
      ]),
    );
  await page
    .locator('[name="scope"]')
    .fill("UI fixture only; no actual session access, writes or new workers");
  await page
    .locator('[name="conditions"]')
    .fill("Inspect referenced test evidence");
  await page
    .getByRole("button", { name: "기존 세션 등록", exact: true })
    .click();
  await page
    .locator(".task-detail")
    .getByRole("heading", {
      name: "Browser fixture: observe an existing session",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Dots 관리 일시정지", exact: true })
    .click();
  await page
    .getByRole("button", { name: "사용자 지시로 관리 재개", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "사용자 지시로 관리 재개", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dots 관리 일시정지", exact: true })
    .waitFor();
  await page.screenshot({ path: join(data, "desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "◌ Dots 후속 판단" }).click();
  await page
    .getByRole("heading", { name: "Dots가 관리 주체예요", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(data, "mobile.png"), fullPage: true });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    failures.push("Mobile layout overflows horizontally");
  if (failures.length) throw new Error(failures.join("\n"));
  const result = {
    passed: true,
    checks: [
      "authenticated existing-session enrollment",
      "watch details",
      "user pause/resume",
      "Dots supervision boundary",
      "mobile layout",
    ],
    realSessionControlled: false,
    modelCalls: 0,
  };
  await writeFile(
    join(data, "browser-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  const stopped = await run(
    [...cli, "stop", "--data-dir", data],
    process.cwd(),
    30_000,
  );
  if (stopped.exitCode !== 0) throw new Error(stopped.stderr);
}

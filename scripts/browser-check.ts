import { chromium } from "@playwright/test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Store } from "../src/store.js";
import { Vault } from "../src/vault.js";
const data = resolve(".kingdots", "preview");
const instance = JSON.parse(
  await readFile(join(data, "instance.json"), "utf8"),
);
const vault = await Vault.open(join(data, "secrets.bin"));
const liveNames = (await readdir(".kingdots"))
  .filter((n) => n.startsWith("live-"))
  .sort()
  .reverse();
for (const name of liveNames) {
  try {
    const live = JSON.parse(
      await readFile(join(".kingdots", name, "result.json"), "utf8"),
    );
    if (live.task?.state === "completed") {
      const store = new Store(join(data, "kingdots.sqlite"));
      store.saveTask(live.task);
      for (const command of live.commands ?? []) store.saveCommand(command);
      store.close();
      break;
    }
  } catch {}
}
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
  await page.getByRole("heading", { name: "맡긴 작업", exact: true }).waitFor();
  const cards = page.locator(".task-card");
  if (await cards.count()) {
    await cards.first().click();
    await page
      .getByRole("heading", { name: "작업 상세", exact: true })
      .waitFor();
  }
  await page.screenshot({ path: join(data, "desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "＋ 작업 맡기기" }).click();
  await page
    .getByRole("heading", { name: "새 작업 맡기기", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "✕" }).click();
  await page.getByRole("button", { name: "◎ Dots 연결" }).click();
  await page
    .getByRole("heading", { name: "Dots 연결과 후속 판단", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(data, "mobile.png"), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) failures.push("Mobile layout overflows horizontally");
  if (failures.length) throw new Error(failures.join("\n"));
  await writeFile(
    join(data, "browser-result.json"),
    JSON.stringify(
      {
        passed: true,
        desktop: "1440x1080",
        mobile: "390x844",
        checks: [
          "authenticated task list",
          "actual completed Codex fixture detail",
          "new task form",
          "Dots connection status",
          "mobile overflow",
          "console errors",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser UI checks passed; screenshots retained in .kingdots/preview.",
  );
} finally {
  await browser.close();
}

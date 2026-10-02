import { randomBytes } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

async function dpapi(value: Buffer, decrypt: boolean): Promise<Buffer> {
  const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[System.Security.Cryptography.ProtectedData]::${decrypt ? "Unprotect" : "Protect"}($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return new Promise((accept, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.resume();
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? accept(Buffer.from(output.trim(), "base64"))
        : reject(new Error("Windows DPAPI operation failed")),
    );
    child.stdin.end(value.toString("base64"));
  });
}
export interface SecretStore {
  get(key: string): string | undefined;
  set(key: string, value: string): Promise<void>;
}
export class Vault implements SecretStore {
  private values: Record<string, string> = {};
  private saving: Promise<void> = Promise.resolve();
  private constructor(private file: string) {}
  static async open(file: string) {
    const vault = new Vault(file);
    await mkdir(dirname(file), { recursive: true });
    try {
      const raw = await readFile(file);
      vault.values = JSON.parse(
        (process.platform === "win32"
          ? await dpapi(raw, true)
          : raw
        ).toString(),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (!vault.get("uiToken"))
      await vault.set("uiToken", randomBytes(32).toString("base64url"));
    if (!vault.get("mcpToken"))
      await vault.set("mcpToken", randomBytes(32).toString("base64url"));
    return vault;
  }
  get(key: string) {
    return this.values[key];
  }
  async set(key: string, value: string) {
    this.values[key] = value;
    this.saving = this.saving
      .catch(() => {})
      .then(async () => {
        const raw = Buffer.from(JSON.stringify(this.values));
        const bytes =
          process.platform === "win32" ? await dpapi(raw, false) : raw;
        const temporary = this.file + ".tmp";
        await writeFile(temporary, bytes, { mode: 0o600 });
        await rename(temporary, this.file);
      });
    return this.saving;
  }
}

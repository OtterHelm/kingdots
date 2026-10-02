import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Task, Command, EventRecord } from "./domain.js";
import { DomainError } from "./domain.js";

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leases (session_key TEXT PRIMARY KEY, task_id TEXT NOT NULL, epoch INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (cursor INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries (subscription_id TEXT NOT NULL, event_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(subscription_id,event_id));
      CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const v = fn();
      this.db.exec("COMMIT");
      return v;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  saveTask(task: Task) {
    this.db
      .prepare(
        "INSERT INTO tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(task.id, JSON.stringify(task));
  }
  getTask(id: string): Task {
    const row = this.db.prepare("SELECT body FROM tasks WHERE id=?").get(id) as
      { body: string } | undefined;
    if (!row) throw new DomainError("not_found", "Task not found", 404);
    return JSON.parse(row.body);
  }
  tasks(): Task[] {
    return (
      this.db.prepare("SELECT body FROM tasks ORDER BY rowid DESC").all() as {
        body: string;
      }[]
    ).map((r) => JSON.parse(r.body));
  }
  command(id: string): Command | null {
    const r = this.db
      .prepare("SELECT body FROM commands WHERE id=?")
      .get(id) as { body: string } | undefined;
    return r ? JSON.parse(r.body) : null;
  }
  saveCommand(c: Command) {
    this.db
      .prepare(
        "INSERT INTO commands VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(c.id, c.taskId, JSON.stringify(c));
  }
  commands(taskId?: string): Command[] {
    const rows = taskId
      ? this.db
          .prepare("SELECT body FROM commands WHERE task_id=? ORDER BY rowid")
          .all(taskId)
      : this.db.prepare("SELECT body FROM commands ORDER BY rowid").all();
    return (rows as { body: string }[]).map((r) => JSON.parse(r.body));
  }
  acquire(sessionKey: string, taskId: string, epoch: number) {
    const existing = this.db
      .prepare("SELECT task_id,epoch FROM leases WHERE session_key=?")
      .get(sessionKey) as { task_id: string; epoch: number } | undefined;
    if (existing && (existing.task_id !== taskId || existing.epoch !== epoch))
      throw new DomainError("session_owned", "Session already has a writer");
    this.db
      .prepare("INSERT OR IGNORE INTO leases VALUES (?,?,?)")
      .run(sessionKey, taskId, epoch);
  }
  release(taskId: string) {
    this.db.prepare("DELETE FROM leases WHERE task_id=?").run(taskId);
  }
  event(task: Task, cause: string): EventRecord {
    const event: EventRecord = {
      id: randomUUID(),
      name:
        task.state === "completed"
          ? "task.completed"
          : "task.attention_required",
      taskId: task.id,
      revision: task.revision,
      cause,
      timestamp: new Date().toISOString(),
      cursor: 0,
    };
    const result = this.db
      .prepare("INSERT INTO events(id,body) VALUES (?,?)")
      .run(event.id, JSON.stringify(event));
    event.cursor = Number(result.lastInsertRowid);
    this.db
      .prepare("UPDATE events SET body=? WHERE id=?")
      .run(JSON.stringify(event), event.id);
    return event;
  }
  events(after = 0): EventRecord[] {
    return (
      this.db
        .prepare(
          "SELECT body FROM events WHERE cursor>? ORDER BY cursor LIMIT 500",
        )
        .all(after) as { body: string }[]
    ).map((r) => JSON.parse(r.body));
  }
  get<T>(
    table: "settings" | "subscriptions" | "approvals",
    key: string,
  ): T | null {
    const col = table === "settings" ? "key" : "id";
    const r = this.db
      .prepare(`SELECT body FROM ${table} WHERE ${col}=?`)
      .get(key) as { body: string } | undefined;
    return r ? JSON.parse(r.body) : null;
  }
  put(
    table: "settings" | "subscriptions" | "approvals",
    key: string,
    value: unknown,
  ) {
    const col = table === "settings" ? "key" : "id";
    this.db
      .prepare(
        `INSERT INTO ${table}(${col},body) VALUES (?,?) ON CONFLICT(${col}) DO UPDATE SET body=excluded.body`,
      )
      .run(key, JSON.stringify(value));
  }
  values<T>(table: "subscriptions" | "approvals"): T[] {
    return (
      this.db.prepare(`SELECT body FROM ${table}`).all() as { body: string }[]
    ).map((r) => JSON.parse(r.body));
  }
  close() {
    this.db.close();
  }
}

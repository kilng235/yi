import { App } from "obsidian";
import { todayStr } from "./utils";

const ACTIVITY_LOG_PATH = "nexus/activity-log.json";

export interface ActivityDay {
  cardComplete: number;
  todoCheck: number;
  cardCreate: number;
  noteEdit: number;
  noteCreate: number;
}

export type ActivityLog = Record<string, ActivityDay>;

export async function loadActivityLog(app: App): Promise<ActivityLog> {
  try {
    const exists = await app.vault.adapter.exists(ACTIVITY_LOG_PATH);
    if (!exists) return {};
    const content = await app.vault.adapter.read(ACTIVITY_LOG_PATH);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function saveActivityLog(app: App, log: ActivityLog): Promise<void> {
  try {
    // 确保 nexus 目录存在
    const dirExists = await app.vault.adapter.exists("nexus");
    if (!dirExists) {
      await app.vault.createFolder("nexus");
    }
    await app.vault.adapter.write(ACTIVITY_LOG_PATH, JSON.stringify(log, null, 2));
  } catch (e) {
    console.error("Failed to save activity log:", e);
  }
}

export function todayKey(): string {
  return todayStr();
}

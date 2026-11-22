import { App } from "obsidian";
import { todayStr } from "./utils";

const ACTIVITY_DIR = "hubstack";
const LEGACY_ACTIVITY_DIR = "nexus";
const ACTIVITY_LOG_PATH = `${ACTIVITY_DIR}/activity-log.json`;
const LEGACY_ACTIVITY_LOG_PATH = `${LEGACY_ACTIVITY_DIR}/activity-log.json`;

export interface ActivityDay {
  cardComplete: number;
  todoCheck: number;
  cardCreate: number;
  noteEdit: number;
  noteCreate: number;
  quizAnswer?: number;
}

export type ActivityLog = Record<string, ActivityDay>;

export async function loadActivityLog(app: App): Promise<ActivityLog> {
  try {
    const activityPath = await resolveExistingPath(app, ACTIVITY_LOG_PATH, LEGACY_ACTIVITY_LOG_PATH);
    if (!activityPath) return {};
    const content = await app.vault.adapter.read(activityPath);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function saveActivityLog(app: App, log: ActivityLog): Promise<void> {
  try {
    const dirExists = await app.vault.adapter.exists(ACTIVITY_DIR);
    if (!dirExists) {
      await app.vault.createFolder(ACTIVITY_DIR);
    }
    await app.vault.adapter.write(ACTIVITY_LOG_PATH, JSON.stringify(log, null, 2));
  } catch (e) {
    console.error("Failed to save activity log:", e);
  }
}

export function todayKey(): string {
  return todayStr();
}

async function resolveExistingPath(app: App, primaryPath: string, legacyPath: string): Promise<string | null> {
  if (await app.vault.adapter.exists(primaryPath)) return primaryPath;
  if (await app.vault.adapter.exists(legacyPath)) return legacyPath;
  return null;
}

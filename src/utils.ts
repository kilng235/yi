// Shared utilities for Nexus plugin

/** Current date in local time as "YYYY-MM-DD" (avoids UTC timezone shift). */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Current month in local time as "YYYY-MM". */
export function monthStr(): string {
  return todayStr().substring(0, 7);
}

/** Format milliseconds into a human-readable duration string */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

/** Shorter format used by bookshelf cards */
export function formatReadingTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return "刚开始";
}

export type CountdownStatusType = "empty" | "invalid" | "future" | "today" | "past";

export interface CountdownStatus {
  status: CountdownStatusType;
  title: string;
  message: string;
  days?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseLocalDate(dateStr: string): Date | null {
  const match = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

/** Normalize a date string (accepts - . / separators) to YYYY-MM-DD */
export function normalizeDateStr(dateStr: string): string {
  const match = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(dateStr.trim());
  if (!match) return dateStr;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

/** Calculate countdown display state from a custom title and local YYYY-MM-DD target date. */
export function getCountdownStatus(name: string, targetDate: string, now: Date = new Date()): CountdownStatus {
  const title = name.trim() || "倒计时";
  const dateText = targetDate.trim();

  if (!name.trim() && !dateText) {
    return { status: "empty", title, message: "未配置倒计时" };
  }

  if (!dateText) {
    return { status: "empty", title, message: "未配置目标日期" };
  }

  if (!/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(dateText)) {
    return { status: "invalid", title, message: "日期格式如 2026-06-17 或 2026.6.17" };
  }

  const target = parseLocalDate(dateText);
  if (!target) {
    return { status: "invalid", title, message: "目标日期不存在" };
  }

  const diffDays = Math.round((target.getTime() - localDateOnly(now).getTime()) / DAY_MS);
  if (diffDays > 0) {
    return { status: "future", title, message: `剩余 ${diffDays} 天`, days: diffDays };
  }
  if (diffDays === 0) {
    return { status: "today", title, message: "就是今天", days: 0 };
  }

  return { status: "past", title, message: `已过 ${Math.abs(diffDays)} 天`, days: Math.abs(diffDays) };
}

/** DeepSeek balance API response */
export interface DeepSeekBalance {
  is_available: boolean;
  balance_infos: {
    currency: string;
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }[];
}

/** Fetch DeepSeek account balance */
export async function fetchDeepSeekBalance(apiKey: string): Promise<DeepSeekBalance | null> {
  try {
    const resp = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

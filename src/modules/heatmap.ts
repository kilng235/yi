import { HubstackSettings } from "../types";
import { ActivityLog } from "../activity-log";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/** GitHub-style rows: only every other weekday is labelled. */
const WEEKDAY_LABEL_ROWS = [0, 2, 4, 6]; // 周一 / 周三 / 周五 / 周日

/** Number of week-columns to render (53 weeks ≈ one year). */
const WEEKS = 53;

export function renderHeatmap(el: HTMLElement, settings: HubstackSettings, activityLog?: ActivityLog) {
  el.empty();
  el.addClass("hubstack-heatmap");

  const scores = buildDailyScores(settings, activityLog);
  const today = startOfDay(new Date());
  const todayKey = formatDate(today);

  // Monday of the current week, rolled back so the grid ends on this week.
  const startMonday = addDays(startOfWeek(today), -(WEEKS - 1) * 7);

  // ---- total over the visible range ----
  let total = 0;
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(startMonday, w * 7 + d);
      if (date.getTime() > today.getTime()) continue;
      total += scores[formatDate(date)] || 0;
    }
  }

  el.empty();

  // ---- header (title + subtitle) ----
  const header = el.createDiv({ cls: "hubstack-heatmap-header" });
  const heading = header.createDiv({ cls: "hubstack-heatmap-heading" });
  heading.createEl("h3", { text: "用量热力图" });
  heading.createDiv({
    cls: "hubstack-heatmap-subtitle",
    text: `最近 ${WEEKS} 周的每日用量 · 共 ${total} 活跃度`,
  });

  // ---- grid ----
  const scroll = el.createDiv({ cls: "hubstack-heatmap-scroll" });
  const table = scroll.createEl("table", { cls: "hubstack-heatmap-table" });

  const thead = table.createEl("thead");
  const headRow = thead.createEl("tr");
  headRow.createEl("th", { cls: "hubstack-heatmap-corner" });
  for (const seg of buildMonthSegments(startMonday)) {
    headRow.createEl("th", {
      text: seg.label,
      cls: "hubstack-heatmap-month",
      attr: { colspan: String(seg.weeks) },
    });
  }

  const tbody = table.createEl("tbody");
  for (let d = 0; d < 7; d++) {
    const row = tbody.createEl("tr");
    row.createEl("th", {
      cls: "hubstack-heatmap-weekday",
      text: WEEKDAY_LABEL_ROWS.includes(d) ? DAY_NAMES[d] : "",
    });

    for (let w = 0; w < WEEKS; w++) {
      const date = addDays(startMonday, w * 7 + d);
      const td = row.createEl("td", { cls: "hubstack-heatmap-td" });

      // Days after today stay blank (the tail of the current week).
      if (date.getTime() > today.getTime()) continue;

      const key = formatDate(date);
      const score = scores[key] || 0;
      const level = score === 0 ? 0 : Math.min(4, Math.ceil(score / 10));
      const cell = td.createDiv({
        cls: [
          "hubstack-heatmap-cell",
          `hubstack-heatmap-cell--level-${level}`,
          key === todayKey ? "hubstack-heatmap-cell--today" : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      cell.createDiv({
        cls: "hubstack-heatmap-tip",
        text: `${score} 活跃度 · ${date.getMonth() + 1}月${date.getDate()}日`,
      });
      // The tooltip is position:fixed so no ancestor overflow can clip it;
      // it must therefore be placed by hand above the hovered cell.
      cell.addEventListener("mouseenter", () => positionTip(cell));
      cell.addEventListener("mouseleave", () => hideTip(cell));
    }
  }

  // ---- legend ----
  const legend = el.createDiv({ cls: "hubstack-heatmap-legend" });
  legend.createSpan({ text: "少" });
  for (let i = 0; i <= 4; i++) {
    legend.createDiv({ cls: `hubstack-heatmap-cell hubstack-heatmap-cell--level-${i}` });
  }
  legend.createSpan({ text: "多" });
}

/**
 * Nudges a heatmap tooltip so it stays inside the visible pane: flips it below
 * the cell when there is no room above, and clamps it horizontally.
 *
 * The tooltip stays `position:absolute` (anchored to the cell) on purpose —
 * the cell scales on hover, and a transformed ancestor would become the
 * containing block for a `position:fixed` child and throw it off-screen.
 * Visibility itself is handled by the CSS :hover rule, so a failure here
 * degrades to the default placement instead of hiding the tooltip.
 */
function positionTip(cell: HTMLElement) {
  const tip = cell.firstElementChild as HTMLElement | null;
  if (!tip) return;

  const cellRect = cell.getBoundingClientRect();
  // visibility:hidden still lays out, so this measurement is valid.
  const tipRect = tip.getBoundingClientRect();

  const bounds = visibleBounds(cell);
  const gap = 8;
  const margin = 4;

  // Flip below when the tooltip would poke out of the top of the pane.
  const flip = cellRect.top - tipRect.height - gap < bounds.top + margin;
  tip.classList.toggle("hubstack-heatmap-tip--below", flip);

  // Clamp horizontally into the pane.
  let dx = 0;
  const left = cellRect.left + cellRect.width / 2 - tipRect.width / 2;
  if (left < bounds.left + margin) {
    dx = bounds.left + margin - left;
  } else if (left + tipRect.width > bounds.right - margin) {
    dx = bounds.right - margin - (left + tipRect.width);
  }

  tip.style.transform = `translateX(calc(-50% + ${dx}px))`;
}

function hideTip(cell: HTMLElement) {
  const tip = cell.firstElementChild as HTMLElement | null;
  if (!tip) return;
  tip.classList.remove("hubstack-heatmap-tip--below");
  tip.style.transform = "translateX(-50%)";
}

/** Bounding box of the nearest clipping ancestor, else the viewport. */
function visibleBounds(el: HTMLElement): { top: number; left: number; right: number } {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|hidden)/.test(`${style.overflowX} ${style.overflowY}`)) {
      const r = node.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right };
    }
    node = node.parentElement;
  }
  return { top: 0, left: 0, right: window.innerWidth };
}

/**
 * Groups week-columns into month bands so each month can be rendered as a
 * single <th colspan="n"> label, the way GitHub does it.
 */
function buildMonthSegments(startMonday: Date): { label: string; weeks: number }[] {
  const segments: { label: string; weeks: number }[] = [];
  let prevMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const m = addDays(startMonday, w * 7).getMonth();
    if (m !== prevMonth) {
      segments.push({ label: `${m + 1}月`, weeks: 1 });
      prevMonth = m;
    } else {
      segments[segments.length - 1].weeks++;
    }
  }
  return segments;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday of the week containing `d` (Mon=0). */
function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  return addDays(r, -((r.getDay() + 6) % 7));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function buildDailyScores(settings: HubstackSettings, activityLog?: ActivityLog): Record<string, number> {
  const scores: Record<string, number> = {};
  const w = settings.heatmapWeights;

  for (const [dateKey, value] of Object.entries(settings.readingSessions || {})) {
    const sessions = Array.isArray(value) ? value : value ? [value] : [];
    const totalMs = sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
    const points = Math.floor(totalMs / (10 * 60 * 1000)) * w.reading10min;
    scores[dateKey] = (scores[dateKey] || 0) + points;
  }

  const log = activityLog || {};
  for (const [dateKey, activity] of Object.entries(log)) {
    const points =
      (activity.cardComplete || 0) * w.cardComplete +
      (activity.cardCreate || 0) * w.cardCreate +
      (activity.noteEdit || 0) * (w.noteEdit || 0) +
      (activity.noteCreate || 0) * (w.noteCreate || 0) +
      (activity.quizAnswer || 0) * (w.quizAnswer || 0);
    scores[dateKey] = (scores[dateKey] || 0) + points;
  }

  return scores;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

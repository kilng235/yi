import { NexusSettings } from "../types";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function renderHeatmap(el: HTMLElement, settings: NexusSettings) {
  el.empty();
  el.addClass("nexus-heatmap");

  const scores = buildDailyScores(settings);
  const maxScore = Math.max(1, ...Object.values(scores));
  const totalPoints = Object.values(scores).reduce((a, b) => a + b, 0);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // Header
  el.createDiv({ cls: "nexus-heatmap-header" })
    .createEl("h3", { text: `${totalPoints} 活跃度` });

  // Month title
  const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  el.createDiv({ cls: "nexus-heatmap-month-title" })
    .createSpan({ text: `${MONTH_NAMES[month]} ${year}`, cls: "nexus-heatmap-month-name" });

  // Calendar table
  const table = el.createEl("table", { cls: "nexus-heatmap-table" });

  // Header row
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const name of DAY_NAMES) {
    headerRow.createEl("th", { text: name, cls: "nexus-heatmap-th" });
  }

  // Calculate days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0

  // Body rows
  const tbody = table.createEl("tbody");
  let dayNum = 1 - startWeekday;

  for (let w = 0; w < 6; w++) {
    if (dayNum > daysInMonth) break;

    const row = tbody.createEl("tr");

    for (let d = 0; d < 7; d++) {
      dayNum++;
      const td = row.createEl("td", { cls: "nexus-heatmap-td" });

      if (dayNum >= 1 && dayNum <= daysInMonth) {
        const date = new Date(year, month, dayNum);
        const key = formatDate(date);
        const score = scores[key] || 0;
        const level = score === 0 ? 0 : Math.min(4, Math.ceil((score / maxScore) * 4));

        const cell = td.createDiv({
          cls: `nexus-heatmap-cell nexus-heatmap-cell--level-${level}`,
        });
        cell.createDiv({
          cls: "nexus-heatmap-tip",
          text: `${score} 活跃度 · ${month + 1}月${dayNum}日`,
        });
      }
      // Empty cells for days outside the month - just leave td empty
    }
  }

  // Legend
  const legend = el.createDiv({ cls: "nexus-heatmap-legend" });
  legend.createSpan({ text: "少" });
  for (let i = 0; i <= 4; i++) {
    legend.createDiv({ cls: `nexus-heatmap-cell nexus-heatmap-cell--level-${i}` });
  }
  legend.createSpan({ text: "多" });
}

function buildDailyScores(settings: NexusSettings): Record<string, number> {
  const scores: Record<string, number> = {};
  const w = settings.heatmapWeights;

  for (const [dateKey, sessions] of Object.entries(settings.readingSessions)) {
    const totalMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
    const points = Math.floor(totalMs / (10 * 60 * 1000)) * w.reading10min;
    scores[dateKey] = (scores[dateKey] || 0) + points;
  }

  for (const [dateKey, activity] of Object.entries(settings.activityLog || {})) {
    const points =
      (activity.cardComplete || 0) * w.cardComplete +
      (activity.todoCheck || 0) * w.todoCheck +
      (activity.cardCreate || 0) * w.cardCreate;
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

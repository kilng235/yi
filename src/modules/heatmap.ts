import { App, TFile } from "obsidian";
import { NexusSettings } from "../types";

const HEATMAP_COLORS = [
  "var(--nx-heat-0)",
  "var(--nx-heat-1)",
  "var(--nx-heat-2)",
  "var(--nx-heat-3)",
  "var(--nx-heat-4)",
];

export function renderHeatmap(el: HTMLElement, settings: NexusSettings, app: App) {
  el.empty();
  el.addClass("nexus-heatmap");

  const header = el.createDiv({ cls: "nexus-heatmap-header" });
  header.createEl("h3", { text: "📊 活动热力图" });

  const grid = el.createDiv({ cls: "nexus-heatmap-grid" });
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364);

  // Align to Sunday
  const dayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOfWeek);

  const weeks = 53;
  const table = grid.createEl("table");
  table.addClass("nexus-heatmap-table");

  // Month labels
  const monthRow = table.createEl("tr");
  monthRow.createEl("td"); // empty corner
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(weekDate.getDate() + w * 7);
    const month = weekDate.getMonth();
    if (month !== lastMonth) {
      const td = monthRow.createEl("td", { text: getMonthName(month) });
      td.addClass("nexus-heatmap-month");
      td.setAttribute("colspan", "1");
      lastMonth = month;
    } else {
      monthRow.createEl("td");
    }
  }

  // Day cells
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  for (let d = 0; d < 7; d++) {
    const row = table.createEl("tr");
    const label = row.createEl("td", { text: dayNames[d] });
    label.addClass("nexus-heatmap-day-label");

    for (let w = 0; w < weeks; w++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + w * 7 + d);
      const dateStr = cellDate.toISOString().slice(0, 10);
      const count = getActivityCount(dateStr, settings);
      const level = getHeatmapLevel(count);

      const td = row.createEl("td");
      td.addClass("nexus-heatmap-cell");
      td.style.backgroundColor = HEATMAP_COLORS[level];
      td.setAttribute("title", `${dateStr}: ${count} 活动`);
    }
  }

  // Legend
  const legend = el.createDiv({ cls: "nexus-heatmap-legend" });
  legend.createSpan({ text: "少" });
  for (let i = 0; i < 5; i++) {
    const box = legend.createDiv();
    box.style.backgroundColor = HEATMAP_COLORS[i];
  }
  legend.createSpan({ text: "多" });
}

function getActivityCount(dateStr: string, settings: NexusSettings): number {
  const activity = settings.activityLog[dateStr];
  if (!activity) return 0;
  const weights = settings.heatmapWeights;
  return (
    activity.cardComplete * weights.cardComplete +
    activity.todoCheck * weights.todoCheck +
    activity.cardCreate * weights.cardCreate
  );
}

function getHeatmapLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

function getMonthName(month: number): string {
  const names = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  return names[month];
}

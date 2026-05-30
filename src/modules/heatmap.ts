import { NexusSettings } from "../types";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function renderHeatmap(el: HTMLElement, settings: NexusSettings) {
  el.empty();
  el.addClass("nexus-heatmap");

  const scores = buildDailyScores(settings);
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth(); // 0-indexed

  function render() {
    const maxScore = Math.max(1, ...getMonthScores(scores, viewYear, viewMonth));
    const totalPoints = getMonthScores(scores, viewYear, viewMonth).reduce((a, b) => a + b, 0);

    el.empty();

    // Header with total
    el.createDiv({ cls: "nexus-heatmap-header" })
      .createEl("h3", { text: `${totalPoints} 活跃度` });

    // Month navigation
    const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const nav = el.createDiv({ cls: "nexus-heatmap-nav" });

    const prevBtn = nav.createDiv({ cls: "nexus-heatmap-arrow" });
    prevBtn.innerHTML = "‹";
    prevBtn.addEventListener("click", () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });

    const monthLabel = nav.createSpan({
      text: `${MONTH_NAMES[viewMonth]} ${viewYear}`,
      cls: "nexus-heatmap-month-name",
    });

    const nextBtn = nav.createDiv({ cls: "nexus-heatmap-arrow" });
    nextBtn.innerHTML = "›";
    nextBtn.addEventListener("click", () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });

    // Disable next if already on current month
    if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) {
      nextBtn.addClass("nexus-heatmap-arrow--disabled");
    }

    // Calendar table
    const table = el.createEl("table", { cls: "nexus-heatmap-table" });

    // Header row
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const name of DAY_NAMES) {
      headerRow.createEl("th", { text: name, cls: "nexus-heatmap-th" });
    }

    // Calculate days
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0

    // Body rows
    const tbody = table.createEl("tbody");
    let dayNum = -startWeekday;

    for (let w = 0; w < 6; w++) {
      if (dayNum > daysInMonth) break;

      const row = tbody.createEl("tr");

      for (let d = 0; d < 7; d++) {
        dayNum++;
        const td = row.createEl("td", { cls: "nexus-heatmap-td" });

        if (dayNum >= 1 && dayNum <= daysInMonth) {
          const date = new Date(viewYear, viewMonth, dayNum);
          const key = formatDate(date);
          const score = scores[key] || 0;
          const level = score === 0 ? 0 : Math.min(4, Math.ceil((score / maxScore) * 4));

          const cell = td.createDiv({
            cls: `nexus-heatmap-cell nexus-heatmap-cell--level-${level}`,
          });
          cell.createDiv({
            cls: "nexus-heatmap-tip",
            text: `${score} 活跃度 · ${viewMonth + 1}月${dayNum}日`,
          });
        }
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

  render();
}

function getMonthScores(scores: Record<string, number>, year: number, month: number): number[] {
  const result: number[] = [];
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const key = formatDate(new Date(year, month, d));
    result.push(scores[key] || 0);
  }
  return result;
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
      (activity.cardCreate || 0) * w.cardCreate +
      (activity.noteEdit || 0) * (w.noteEdit || 0) +
      (activity.noteCreate || 0) * (w.noteCreate || 0);
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

import { KanbanData, KanbanCard } from "../types";
import { KanbanSync } from "../kanban-sync";
import { InputModal } from "./input-modal";
import { App } from "obsidian";
import { ActivityLog } from "../activity-log";
import { todayStr, monthStr } from "../utils";

/**
 * Count this month's completed cards from archive file.
 * Supports both the new multi-line format (^### headings) and
 * the legacy single-line format (^- [x] entries) for backward compatibility.
 */
async function countArchivedThisMonth(app: App, monthKey: string): Promise<number> {
  try {
    const archivePath = `nexus/archive/${monthKey}.md`;
    const file = app.vault.getFileByPath(archivePath);
    if (!file) return 0;
    const content = await app.vault.read(file);
    const cards = content.match(/^### .+/gm);
    const legacy = content.match(/^- \[x\] .+ <!-- .+ -->/gm);
    return (cards ? cards.length : 0) + (legacy ? legacy.length : 0);
  } catch {
    return 0;
  }
}

/**
 * Count today's completed tasks from kanban data.
 * Uses the last column (completed column by position) rather than a hardcoded name.
 * Only counts cards whose completedAt matches today's local date.
 */
function countTodayCompleted(data: KanbanData): number {
  if (data.columns.length === 0) return 0;
  const lastCol = data.columns[data.columns.length - 1];
  const today = todayStr();
  return lastCol.cards.filter((c) => c.type === "task" && c.checked && c.completedAt === today).length;
}

export async function renderTodo(
  el: HTMLElement,
  data: KanbanData,
  sync: KanbanSync,
  app: App,
  activityLog: ActivityLog,
  cleanupFns: Array<() => void>
) {
  el.empty();
  el.addClass("nexus-todo");

  const header = el.createDiv({ cls: "nexus-todo-header" });
  const headerMain = header.createDiv({ cls: "nexus-todo-header-main" });
  headerMain.createEl("h3", { text: "待办" });

  // Collect task cards from all columns (position-based, not name-based)
  const taskCards = data.columns
    .flatMap((col) =>
      col.cards
        .filter((c) => c.type === "task")
        .map((c) => ({ ...c, columnName: col.name }))
    )
    .sort((a, b) => {
      // Unchecked first, checked last
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      // Among unchecked: due date ascending (earliest/overdue first)
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      // Fallback: newer tasks first
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  // Pending = tasks in the first column that are not checked
  const firstColName = data.columns[0]?.name;
  const pendingCount = taskCards.filter((card) => !card.checked && card.columnName === firstColName).length;
  const monthKey = monthStr();
  const todayCount = countTodayCompleted(data);
  const archivedCount = await countArchivedThisMonth(app, monthKey);
  const completedCount = todayCount + archivedCount;

  const statsEl = headerMain.createDiv({ cls: "nexus-todo-stats" });
  statsEl.createEl("span", {
    cls: "nexus-todo-stat nexus-todo-stat--pending",
    text: `待办 ${pendingCount}`,
  });
  statsEl.createEl("span", {
    cls: "nexus-todo-stat nexus-todo-stat--completed",
    text: `本月完成 ${completedCount}`,
  });

  // Add task button
  const addBtn = header.createEl("button", {
    cls: "nexus-todo-add-btn",
    text: "+ 添加任务",
  });
  addBtn.addEventListener("click", () => {
    if (!data.columns.length) return;
    new InputModal(app, "新建任务", "输入任务内容", async (title) => {
      const newCard: KanbanCard = {
        id: `card-${Date.now().toString(36)}`,
        title,
        type: "task",
        body: "",
        tags: [],
        dueDate: "",
        checked: false,
        createdAt: todayStr(),
        completedAt: "",
        tasks: [],
      };
      // Add to first column (position-based)
      await sync.addCard(data.columns[0].name, newCard);
    }).open();
  });

  const listEl = el.createDiv({ cls: "nexus-todo-list" });

  if (taskCards.length === 0) {
    listEl.createDiv({
      cls: "nexus-todo-empty",
      text: "暂无任务。点击上方「添加任务」创建。",
    });
    return;
  }

  for (const card of taskCards) {
    const itemEl = listEl.createDiv({ cls: "nexus-todo-item" });

    const checkbox = itemEl.createEl("input", {
      type: "checkbox",
      cls: "nexus-todo-checkbox",
    }) as HTMLInputElement;
    checkbox.checked = card.checked;
    checkbox.addEventListener("change", async () => {
      await sync.toggleCard(card.id, checkbox.checked);
    });

    const label = itemEl.createEl("span", {
      text: card.title,
      cls: "nexus-todo-label",
    });
    if (card.checked) label.addClass("nexus-todo-label--done");

    // Show column name as context
    itemEl.createEl("span", {
      text: card.columnName,
      cls: "nexus-todo-context",
    });
  }
}

import { KanbanData, KanbanCard } from "../types";
import { KanbanSync } from "../kanban-sync";
import { InputModal } from "./input-modal";
import { App } from "obsidian";
import { ActivityLog } from "../activity-log";

export function renderTodo(
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

  // Collect all task cards from all columns
  const taskCards = data.columns.flatMap((col) =>
    col.cards
      .filter((c) => c.type === "task")
      .map((c) => ({ ...c, columnName: col.name }))
  );

  const pendingCount = taskCards.filter((card) => !card.checked).length;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const completedCount = Object.entries(activityLog || {}).reduce((sum, [dateKey, activity]) => {
    if (!dateKey.startsWith(monthKey)) return sum;
    return sum + (activity.todoCheck || 0);
  }, 0);

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
    new InputModal(app, "新建任务", "输入任务内容", async (title) => {
      const newCard: KanbanCard = {
        id: `card-${Date.now().toString(36)}`,
        title,
        type: "task",
        body: "",
        tags: [],
        dueDate: "",
        checked: false,
        createdAt: new Date().toISOString().slice(0, 10),
        completedAt: "",
        tasks: [],
      };
      // Add to first column (待做)
      await sync.addCard(data.columns[0]?.name || "待做", newCard);
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

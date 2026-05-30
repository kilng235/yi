import { App, MarkdownView, TFile } from "obsidian";
import { NexusSettings, KanbanCard } from "../types";
import { InputModal } from "./input-modal";

export function renderTodo(el: HTMLElement, settings: NexusSettings, app: App) {
  el.empty();
  el.addClass("nexus-todo");

  const header = el.createDiv({ cls: "nexus-todo-header" });
  header.createEl("h3", { text: "📋 待办事项" });

  // Get all unchecked cards from kanban
  const kanbanFile = app.vault.getAbstractFileByPath(settings.kanbanFile + ".md");
  if (!(kanbanFile instanceof TFile)) {
    el.createDiv({ text: "未找到看板文件", cls: "nexus-todo-empty" });
    return;
  }

  app.vault.read(kanbanFile).then(content => {
    const cards = parseKanbanCards(content);
    const unchecked = cards.filter(c => !c.checked);

    if (unchecked.length === 0) {
      el.createDiv({ text: "🎉 所有任务已完成！", cls: "nexus-todo-empty" });
      return;
    }

    const list = el.createDiv({ cls: "nexus-todo-list" });
    for (const card of unchecked) {
      const item = list.createDiv({ cls: "nexus-todo-item" });
      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.addEventListener("change", () => {
        markCardComplete(kanbanFile, card, app, settings);
        item.addClass("nexus-todo-completed");
        setTimeout(() => item.remove(), 300);
      });
      item.createSpan({ text: card.title, cls: "nexus-todo-title" });
      if (card.dueDate) {
        item.createSpan({ text: card.dueDate, cls: "nexus-todo-due" });
      }
    }
  });
}

function parseKanbanCards(content: string): KanbanCard[] {
  const cards: KanbanCard[] = [];
  const lines = content.split("\n");
  let currentCard: Partial<KanbanCard> | null = null;

  for (const line of lines) {
    if (line.startsWith("- [x] ") || line.startsWith("- [ ] ")) {
      if (currentCard) cards.push(currentCard as KanbanCard);
      currentCard = {
        title: line.replace(/^- \[[x ]\] /, ""),
        checked: line.startsWith("- [x] "),
      };
    }
  }
  if (currentCard) cards.push(currentCard as KanbanCard);
  return cards;
}

async function markCardComplete(file: TFile, card: KanbanCard, app: App, settings: NexusSettings) {
  const content = await app.vault.read(file);
  const updated = content.replace(
    `- [ ] ${card.title}`,
    `- [x] ${card.title}`
  );
  await app.vault.modify(file, updated);

  // Update activity log
  const today = new Date().toISOString().slice(0, 10);
  if (!settings.activityLog[today]) {
    settings.activityLog[today] = { cardComplete: 0, todoCheck: 0, cardCreate: 0 };
  }
  settings.activityLog[today].todoCheck++;
  app.vault.adapter.write(
    app.vault.configDir + "/plugins/nexus/data.json",
    JSON.stringify(settings, null, 2)
  );
}

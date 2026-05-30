import { KanbanData, KanbanCard } from "../types";
import { KanbanSync } from "../kanban-sync";
import { FilePickerModal } from "./file-picker-modal";
import { App } from "obsidian";

export function renderKanban(
  el: HTMLElement,
  data: KanbanData,
  sync: KanbanSync,
  app: App,
  cleanupFns: Array<() => void>
) {
  el.empty();
  el.addClass("nexus-kanban");

  const header = el.createDiv({ cls: "nexus-kanban-header" });
  header.createEl("h3", { text: "看板" });

  const board = el.createDiv({ cls: "nexus-kanban-board" });

  for (const col of data.columns) {
    const colEl = board.createDiv({ cls: "nexus-kanban-column" });
    colEl.style.setProperty("--col-color", col.color);

    const colHeader = colEl.createDiv({ cls: "nexus-kanban-col-header" });
    colHeader.createEl("span", { text: col.name, cls: "nexus-kanban-col-name" });
    colHeader.createEl("span", {
      text: String(col.cards.length),
      cls: "nexus-kanban-col-count",
    });

    const cardsEl = colEl.createDiv({ cls: "nexus-kanban-cards" });

    const isLastColumn = data.columns.indexOf(col) === data.columns.length - 1;
    for (const card of col.cards) {
      renderCard(cardsEl, card, col.name, col.color, sync, cleanupFns, isLastColumn);
    }

    // Add file button
    const addFileBtn = colEl.createDiv({ cls: "nexus-kanban-add-card" });
    addFileBtn.setText("+ 添加文件");
    addFileBtn.addEventListener("click", () => {
      new FilePickerModal(app, async (file) => {
        const newCard: KanbanCard = {
          id: `card-${Date.now().toString(36)}`,
          title: file.basename,
          type: "project",
          body: `[[${file.path}]]`,
          tags: [],
          dueDate: "",
          checked: false,
          createdAt: new Date().toISOString().slice(0, 10),
          completedAt: "",
          tasks: [],
        };
        await sync.addCard(col.name, newCard);
      }).open();
    });

    // Drag & drop on column
    cardsEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      colEl.addClass("nexus-kanban-column--drag-over");
    });
    cardsEl.addEventListener("dragleave", () => {
      colEl.removeClass("nexus-kanban-column--drag-over");
    });
    cardsEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      colEl.removeClass("nexus-kanban-column--drag-over");
      const cardId = e.dataTransfer?.getData("text/plain");
      console.log("[Nexus] Column drop:", cardId, "to", col.name);
      if (cardId) {
        await sync.moveCard(cardId, col.name, col.cards.length);
        console.log("[Nexus] Column move done");
      }
    });
  }
}

function renderCard(
  el: HTMLElement,
  card: KanbanCard,
  columnName: string,
  columnColor: string,
  sync: KanbanSync,
  cleanupFns: Array<() => void>,
  isLastColumn: boolean = false
) {
  const cardEl = el.createDiv({ cls: "nexus-kanban-card" });
  cardEl.draggable = true;
  cardEl.dataset.cardId = card.id;

  // Set column color tint via inline style (more reliable than CSS variable)
  cardEl.style.background = hexToRgba(columnColor, 0.08);

  // Mark as done if in last column or checked
  if (isLastColumn || card.checked) {
    cardEl.addClass("nexus-kanban-card--done");
    cardEl.style.background = hexToRgba(columnColor, 0.04);
  }

  // Task checkbox
  if (card.type === "task") {
    cardEl.addClass("nexus-kanban-card--task");
    const checkbox = cardEl.createEl("input", {
      type: "checkbox",
      cls: "nexus-kanban-card-checkbox",
    }) as HTMLInputElement;
    checkbox.checked = card.checked;
    checkbox.addEventListener("change", async (e) => {
      e.stopPropagation();
      await sync.toggleCard(card.id, checkbox.checked);
    });
    // Prevent drag when clicking checkbox
    checkbox.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  // Drag
  cardEl.addEventListener("dragstart", (e) => {
    e.stopPropagation(); // Prevent grid cell drag from overriding
    e.dataTransfer?.setData("text/plain", card.id);
    e.dataTransfer!.effectAllowed = "move";
    cardEl.addClass("nexus-kanban-card--dragging");
  });
  cardEl.addEventListener("dragend", () => {
    cardEl.removeClass("nexus-kanban-card--dragging");
  });
  // Allow dropping on cards (propagate to column)
  cardEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  cardEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const cardId = e.dataTransfer?.getData("text/plain");
    console.log("[Nexus] Card drop:", cardId, "to", columnName);
    if (cardId) {
      await sync.moveCard(cardId, columnName, 0);
      console.log("[Nexus] Card moved successfully");
    }
  });

  // Title + delete button
  const titleRow = cardEl.createDiv({ cls: "nexus-kanban-card-title-row" });
  const titleEl = titleRow.createEl("div", { text: card.title, cls: "nexus-kanban-card-title" });
  if (card.checked) titleEl.addClass("nexus-kanban-card-title--done");

  const deleteBtn = titleRow.createEl("button", {
    cls: "nexus-kanban-card-delete",
    attr: { "aria-label": "删除" },
  });
  deleteBtn.innerHTML = "×";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await sync.removeCard(card.id);
  });
  deleteBtn.addEventListener("mousedown", (e) => e.stopPropagation());

  // Tags
  if (card.tags.length > 0) {
    const tagsEl = cardEl.createDiv({ cls: "nexus-kanban-card-tags" });
    for (const tag of card.tags) {
      tagsEl.createSpan({ text: tag, cls: "nexus-kanban-card-tag" });
    }
  }

  // Due date
  if (card.dueDate) {
    cardEl.createEl("div", {
      text: card.dueDate,
      cls: "nexus-kanban-card-due",
    });
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

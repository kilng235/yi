import { App, TFile } from "obsidian";
import { KanbanData, KanbanColumn, KanbanCard, HubstackSettings } from "./types";
import { getTodoCheckDelta } from "./todo-completion";
import { todayStr } from "./utils";
import {
  parseKanbanMarkdown,
  toKanbanMarkdown,
  generateCardId,
  hashContent,
} from "./kanban-parser";
import { archiveCompletedCards, MidnightScheduler } from "./kanban-archive";

export class KanbanSync {
  private app: App;
  private settings: HubstackSettings;
  private file: TFile | null = null;
  private data: KanbanData | null = null;
  private lastWrittenHash: number = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs = 300;
  private midnight = new MidnightScheduler();
  private callbacks: Array<(data: KanbanData) => void | Promise<void>> = [];
  private eventRef: any = null;
  private loading: boolean = false;
  private onActivity: ((type: string) => void) | null = null;

  setActivityCallback(cb: (type: string) => void) {
    this.onActivity = cb;
  }

  constructor(app: App, settings: HubstackSettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: HubstackSettings) {
    this.settings = settings;
  }

  onDataUpdate(cb: (data: KanbanData) => void) {
    this.callbacks.push(cb);
  }

  async init() {
    await this.findOrCreateFile();
    this.registerFileWatcher();
    await this.load();
    this.midnight.schedule(() => this.load());
  }

  destroy() {
    if (this.eventRef) {
      this.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.midnight.cancel();
  }

  getData(): KanbanData | null {
    return this.data;
  }

  async refresh() {
    await this.load();
  }

  // ===== Card operations =====

  async addCard(columnName: string, card: KanbanCard) {
    if (!this.data) return;
    const col = this.data.columns.find((c) => c.name === columnName);
    if (!col) return;
    col.cards.push(card);
    if (this.onActivity) this.onActivity("cardCreate");
    await this.writeToDisk();
  }

  async toggleCard(cardId: string, checked: boolean) {
    if (!this.data) return;
    const cols = this.data.columns;
    let changed = false;
    for (let ci = 0; ci < cols.length; ci++) {
      const idx = cols[ci].cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        const card = cols[ci].cards[idx];
        const previousChecked = card.checked;
        const previousCompletedAt = card.completedAt;
        card.checked = checked;
        card.completedAt = checked ? todayStr() : "";
        for (const task of card.tasks) {
          task.checked = checked;
        }
        // Auto-move: checked → last column, unchecked → first column
        const targetIndex = checked ? cols.length - 1 : 0;
        if (ci !== targetIndex) {
          cols[ci].cards.splice(idx, 1);
          cols[targetIndex].cards.push(card);
        }
        const delta = getTodoCheckDelta(previousChecked, checked, previousCompletedAt);
        if (delta === 1 && this.onActivity) this.onActivity("todoCheck");
        if (delta === -1 && this.onActivity) this.onActivity("todoUncheck");
        changed = previousChecked !== checked || previousCompletedAt !== card.completedAt || ci !== targetIndex;
        break;
      }
    }
    if (changed) await this.writeToDisk();
  }

  async moveCard(cardId: string, toColumn: string, toIndex: number) {
    if (!this.data) return;
    const cols = this.data.columns;
    let moved: KanbanCard | null = null;
    let sourceIndex = -1;
    let sourceColumnName = "";
    for (const col of cols) {
      const idx = col.cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        sourceIndex = idx;
        sourceColumnName = col.name;
        moved = col.cards.splice(idx, 1)[0];
        break;
      }
    }
    if (!moved) return;
    const target = cols.find((c) => c.name === toColumn);
    if (!target) {
      cols[sourceIndex >= 0 ? sourceIndex : 0].cards.splice(sourceIndex >= 0 ? sourceIndex : 0, 0, moved);
      return;
    }
    // Auto-mark completed when moved to last column
    const isLastColumn = cols.indexOf(target) === cols.length - 1;
    if (isLastColumn) {
      moved.checked = true;
      moved.completedAt = todayStr();
      for (const task of moved.tasks) task.checked = true;
    }
    const adjustedIndex = (sourceColumnName === toColumn && sourceIndex < toIndex)
      ? toIndex - 1 : toIndex;
    target.cards.splice(adjustedIndex, 0, moved);
    if (isLastColumn && this.onActivity) this.onActivity("cardComplete");
    await this.writeToDisk();
  }

  async removeCard(cardId: string) {
    if (!this.data) return;
    for (const col of this.data.columns) {
      const idx = col.cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        col.cards.splice(idx, 1);
        break;
      }
    }
    await this.writeToDisk();
  }

  async addColumn(name: string) {
    if (!this.data) return;
    this.data.columns.push({ name, color: "#6366f1", cards: [] });
    await this.writeToDisk();
  }

  async removeColumn(name: string) {
    if (!this.data) return;
    this.data.columns = this.data.columns.filter((c) => c.name !== name);
    await this.writeToDisk();
  }

  // ===== File I/O =====

  private async findOrCreateFile() {
    const path = this.settings.kanbanFile.trim();
    const filePath = path.endsWith(".md") ? path : `${path}.md`;
    let file = this.app.vault.getFileByPath(filePath);
    if (!file) {
      const content = this.getDefaultContent();
      file = await this.app.vault.create(filePath, content);
    }
    this.file = file;
  }

  private getDefaultContent(): string {
    return `---
columns:
  - name: 待做
    color: "#f59e0b"
  - name: 已完成
    color: "#10b981"
---

## 待做

### 欢迎使用 Hubstack
type: task
date: ${todayStr()}

- [ ] 试试添加一张新卡片
- [ ] 拖拽卡片到其他列
- [ ] 看看热力图

## 已完成
`;
  }

  private registerFileWatcher() {
    this.eventRef = this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file === this.file) {
        this.onFileModify();
      }
    });
  }

  private onFileModify() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.load(), this.debounceMs);
  }

  private async load() {
    if (!this.file || this.loading) return;
    this.loading = true;
    try {
      const content = await this.app.vault.cachedRead(this.file);
      const hash = hashContent(content);
      if (hash !== this.lastWrittenHash) {
        this.data = parseKanbanMarkdown(content);
      }
      // Always archive completed cards from previous days
      if (this.data) {
        const archived = await archiveCompletedCards(this.app, this.data);
        if (archived) {
          await this.silentWrite(toKanbanMarkdown(this.data));
        }
      }
      await this.notifyCallbacks();
    } finally {
      this.loading = false;
    }
    this.midnight.schedule(() => this.load());
  }

  private async silentWrite(content: string) {
    if (!this.file) return;
    if (this.eventRef) {
      this.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    this.lastWrittenHash = hashContent(content);
    try {
      await this.app.vault.modify(this.file, content);
    } catch (e) {
      console.error("Hubstack: failed to write kanban data", e);
    }
    this.registerFileWatcher();
  }

  private async writeToDisk() {
    if (!this.data || !this.file) return;
    const content = toKanbanMarkdown(this.data);
    this.lastWrittenHash = hashContent(content);
    try {
      await this.app.vault.modify(this.file, content);
    } catch (e) {
      console.error("Hubstack: failed to write kanban data", e);
    }
    await this.notifyCallbacks();
    this.midnight.schedule(() => this.load());
  }

  private async notifyCallbacks() {
    if (!this.data) return;
    for (const cb of this.callbacks) {
      try {
        await cb(this.data);
      } catch (e) {
        console.error("Hubstack: callback error", e);
      }
    }
  }
}

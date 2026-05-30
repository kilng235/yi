import { App, TFile } from "obsidian";
import { KanbanData, KanbanColumn, KanbanCard, NexusSettings } from "./types";

const HASH_FN = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
};

export class KanbanSync {
  private app: App;
  private settings: NexusSettings;
  private file: TFile | null = null;
  private data: KanbanData | null = null;
  private lastWrittenHash: number = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs = 300;
  private callbacks: Array<(data: KanbanData) => void> = [];
  private eventRef: any = null;
  private onActivity: ((type: string) => void) | null = null;

  setActivityCallback(cb: (type: string) => void) {
    this.onActivity = cb;
  }

  constructor(app: App, settings: NexusSettings) {
    this.app = app;
    this.settings = settings;
  }

  updateSettings(settings: NexusSettings) {
    this.settings = settings;
  }

  onDataUpdate(cb: (data: KanbanData) => void) {
    this.callbacks.push(cb);
  }

  async init() {
    await this.findOrCreateFile();
    this.registerFileWatcher();
    await this.load();
  }

  destroy() {
    if (this.eventRef) {
      this.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
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
    let moved = false;
    for (let ci = 0; ci < cols.length; ci++) {
      const idx = cols[ci].cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        const card = cols[ci].cards[idx];
        card.checked = checked;
        card.completedAt = checked ? new Date().toISOString().slice(0, 10) : "";
        for (const task of card.tasks) {
          task.checked = checked;
        }
        // Auto-move: checked → last column, unchecked → first column
        const targetIndex = checked ? cols.length - 1 : 0;
        if (ci !== targetIndex) {
          cols[ci].cards.splice(idx, 1);
          cols[targetIndex].cards.push(card);
        }
        moved = true;
        break;
      }
    }
    if (checked && this.onActivity) this.onActivity("todoCheck");
    if (moved) await this.writeToDisk();
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
      // Put card back in source column
      cols[sourceIndex >= 0 ? sourceIndex : 0].cards.splice(sourceIndex >= 0 ? sourceIndex : 0, 0, moved);
      return;
    }
    // Auto-mark completed when moved to last column
    const isLastColumn = cols.indexOf(target) === cols.length - 1;
    if (isLastColumn) {
      moved.checked = true;
      moved.completedAt = new Date().toISOString().slice(0, 10);
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
  - name: 进行中
    color: "#6366f1"
  - name: 已完成
    color: "#10b981"
---

## 待做

### 欢迎使用 Nexus
type: task
date: ${new Date().toISOString().slice(0, 10)}

- [ ] 试试添加一张新卡片
- [ ] 拖拽卡片到其他列
- [ ] 看看热力图

## 进行中

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
    if (!this.file) return;
    const content = await this.app.vault.cachedRead(this.file);
    const hash = HASH_FN(content);
    if (hash === this.lastWrittenHash) return;
    this.data = this.parseMarkdown(content);
    if (this.pruneCompletedCards()) {
      await this.writeToDisk();
    }
    this.notifyCallbacks();
  }

  private pruneCompletedCards(): boolean {
    if (!this.data) return false;
    const today = new Date().toISOString().slice(0, 10);
    let pruned = false;
    for (const col of this.data.columns) {
      const before = col.cards.length;
      col.cards = col.cards.filter((c) => !c.checked || c.completedAt === today);
      if (col.cards.length < before) pruned = true;
    }
    return pruned;
  }

  private async writeToDisk() {
    if (!this.data || !this.file) return;
    const content = this.toMarkdown(this.data);
    this.lastWrittenHash = HASH_FN(content);
    try {
      await this.app.vault.modify(this.file, content);
    } catch (e) {
      console.error("Nexus: failed to write kanban data", e);
    }
    this.notifyCallbacks();
  }

  private notifyCallbacks() {
    if (!this.data) return;
    for (const cb of this.callbacks) cb(this.data);
  }

  // ===== Markdown parsing =====

  private parseMarkdown(raw: string): KanbanData {
    const lines = raw.split("\n");
    const columns: KanbanColumn[] = [];

    // Parse frontmatter for column definitions
    let inFrontmatter = false;
    let frontmatterEnd = -1;
    const columnDefs: Record<string, string> = {};
    let lastColumnName = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (i === 0 && line === "---") {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (line === "---") {
          frontmatterEnd = i;
          break;
        }
        // Parse column defs from frontmatter
        const nameMatch = line.match(/- name:\s*(.+)/);
        if (nameMatch) {
          lastColumnName = nameMatch[1].trim();
          columnDefs[lastColumnName] = "#6366f1";
        }
        const colorMatch = line.match(/color:\s*(.+)/);
        if (colorMatch && lastColumnName) {
          columnDefs[lastColumnName] = colorMatch[1].trim();
        }
      }
    }

    // Parse sections (## headings = columns)
    let currentColumn: KanbanColumn | null = null;
    let currentCard: Partial<KanbanCard> | null = null;
    let currentCardTasks: { text: string; checked: boolean }[] = [];
    let currentCardLines: string[] = [];

    const flushCard = () => {
      if (currentCard && currentColumn && currentCard.title) {
        const card: KanbanCard = {
          id: currentCard.id || this.generateId(currentCard.title, currentColumn.name),
          title: currentCard.title,
          type: currentCard.type || "note",
          body: currentCardLines.join("\n").trim(),
          tags: currentCard.tags || [],
          dueDate: currentCard.dueDate || "",
          checked: currentCardTasks.length > 0 ? currentCardTasks.every((t) => t.checked) : false,
          createdAt: currentCard.createdAt || "",
          completedAt: (currentCard as any).completedAt || "",
          tasks: currentCardTasks,
        };
        currentColumn.cards.push(card);
      }
      currentCard = null;
      currentCardTasks = [];
      currentCardLines = [];
    };

    for (let i = frontmatterEnd + 1; i < lines.length; i++) {
      const line = lines[i];

      // ## Column heading
      if (line.startsWith("## ")) {
        flushCard();
        const name = line.slice(3).trim();
        currentColumn = { name, color: columnDefs[name] || "#6366f1", cards: [] };
        columns.push(currentColumn);
        continue;
      }

      if (!currentColumn) continue;

      // ### Card heading
      if (line.startsWith("### ")) {
        flushCard();
        currentCard = {
          title: line.slice(4).trim(),
          type: "note",
          tags: [],
          dueDate: "",
          createdAt: "",
        };
        continue;
      }

      if (!currentCard) continue;

      // Card metadata lines
      const typeMatch = line.match(/^type:\s*(task|note|project)/);
      if (typeMatch) {
        currentCard.type = typeMatch[1] as any;
        continue;
      }
      const dateMatch = line.match(/^date:\s*(.+)/);
      if (dateMatch) {
        currentCard.createdAt = dateMatch[1].trim();
        continue;
      }
      const tagMatch = line.match(/^tags:\s*(.+)/);
      if (tagMatch) {
        currentCard.tags = tagMatch[1].split(",").map((t) => t.trim());
        continue;
      }
      const completedMatch = line.match(/^completed:\s*(.+)/);
      if (completedMatch && currentCard) {
        currentCard.completedAt = completedMatch[1].trim();
        continue;
      }

      // Task items
      const taskMatch = line.match(/^- \[([ xX])\]\s*(.+)$/);
      if (taskMatch) {
        currentCardTasks.push({
          text: taskMatch[2],
          checked: taskMatch[1] !== " ",
        });
        continue;
      }

      // Body lines
      if (line.trim()) {
        currentCardLines.push(line);
      }
    }
    flushCard();

    // Fill in missing columns from frontmatter
    for (const name of Object.keys(columnDefs)) {
      if (!columns.find((c) => c.name === name)) {
        columns.push({ name, color: columnDefs[name] || "#6366f1", cards: [] });
      }
    }

    return { columns };
  }

  private toMarkdown(data: KanbanData): string {
    let md = "---\ncolumns:\n";
    for (const col of data.columns) {
      md += `  - name: ${col.name}\n    color: ${col.color}\n`;
    }
    md += "---\n\n";

    for (const col of data.columns) {
      md += `## ${col.name}\n\n`;
      for (const card of col.cards) {
        md += `### ${card.title}\n`;
        md += `type: ${card.type}\n`;
        if (card.createdAt) md += `date: ${card.createdAt}\n`;
        if (card.completedAt) md += `completed: ${card.completedAt}\n`;
        if (card.tags.length) md += `tags: ${card.tags.join(", ")}\n`;
        md += "\n";
        for (const task of card.tasks) {
          md += `- [${task.checked ? "x" : " "}] ${task.text}\n`;
        }
        if (card.body) md += card.body + "\n";
        md += "\n";
      }
    }

    return md;
  }

  private generateId(title: string, column: string): string {
    const key = `${title}::${column}`;
    return `card-${Math.abs(HASH_FN(key)).toString(36)}`;
  }
}

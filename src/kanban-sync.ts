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
  private debounceTimer: number | null = null;
  private listeners: Array<() => void> = [];

  constructor(app: App, settings: NexusSettings) {
    this.app = app;
    this.settings = settings;
  }

  async init() {
    this.file = this.app.vault.getAbstractFileByPath(this.settings.kanbanFile + ".md") as TFile;
    if (!this.file) return;

    const content = await this.app.vault.read(this.file);
    this.data = this.parseMarkdown(content);
    this.lastWrittenHash = HASH_FN(content);

    // Watch for external changes
    this.app.vault.on("modify", async (file) => {
      if (file !== this.file) return;
      const newContent = await this.app.vault.read(this.file!);
      const newHash = HASH_FN(newContent);
      if (newHash === this.lastWrittenHash) return; // our own write
      this.data = this.parseMarkdown(newContent);
      this.lastWrittenHash = newHash;
      this.notifyListeners();
    });
  }

  getData(): KanbanData | null {
    return this.data;
  }

  onChange(listener: () => void) {
    this.listeners.push(listener);
  }

  private notifyListeners() {
    for (const fn of this.listeners) fn();
  }

  async updateCard(columnIndex: number, cardIndex: number, updates: Partial<KanbanCard>) {
    if (!this.data || !this.file) return;
    const card = this.data.columns[columnIndex]?.cards[cardIndex];
    if (!card) return;
    Object.assign(card, updates);
    await this.write();
  }

  async moveCard(fromCol: number, fromIdx: number, toCol: number, toIdx: number) {
    if (!this.data || !this.file) return;
    const from = this.data.columns[fromCol];
    const to = this.data.columns[toCol];
    if (!from || !to) return;

    const [card] = from.cards.splice(fromIdx, 1);
    to.cards.splice(toIdx, 0, card);
    await this.write();
  }

  async addCard(columnIndex: number, card: KanbanCard) {
    if (!this.data || !this.file) return;
    const col = this.data.columns[columnIndex];
    if (!col) return;
    col.cards.push(card);
    await this.write();
  }

  async deleteCard(columnIndex: number, cardIndex: number) {
    if (!this.data || !this.file) return;
    const col = this.data.columns[columnIndex];
    if (!col) return;
    col.cards.splice(cardIndex, 1);
    await this.write();
  }

  private async write() {
    if (!this.data || !this.file) return;
    const md = this.toMarkdown(this.data);
    this.lastWrittenHash = HASH_FN(md);
    await this.app.vault.modify(this.file, md);
  }

  private parseMarkdown(content: string): KanbanData {
    const columns: KanbanColumn[] = [];
    const lines = content.split("\n");
    let current: KanbanColumn | null = null;

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (current) columns.push(current);
        current = { name: line.slice(3).trim(), color: "", cards: [] };
      } else if (current && line.match(/^- \[[x ]\] /)) {
        const checked = line.startsWith("- [x] ");
        const title = line.replace(/^- \[[x ]\] /, "");
        current.cards.push({
          id: Math.random().toString(36).slice(2, 8),
          title,
          type: "task",
          body: "",
          tags: [],
          dueDate: "",
          checked,
          createdAt: "",
          completedAt: "",
          tasks: [],
        });
      }
    }
    if (current) columns.push(current);
    return { columns };
  }

  private toMarkdown(data: KanbanData): string {
    return data.columns.map(col => {
      const header = `## ${col.name}`;
      const cards = col.cards.map(card => {
        const check = card.checked ? "- [x] " : "- [ ] ";
        return `${check}${card.title}`;
      });
      return [header, ...cards].join("\n");
    }).join("\n\n");
  }
}

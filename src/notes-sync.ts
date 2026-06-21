import { App, TFile } from "obsidian";
import { Note } from "./types";

const NOTES_DIR = "hubstack/notes";
const ARCHIVE_DIR = "hubstack/notes-archive";

export class NotesSync {
  private app: App;
  private notes: Note[] = [];
  private loading = false;
  private eventRef: any = null;
  private callbacks: Array<(notes: Note[]) => void | Promise<void>> = [];

  constructor(app: App) {
    this.app = app;
  }

  onChange(cb: (notes: Note[]) => void | Promise<void>) {
    this.callbacks.push(cb);
  }

  async init() {
    await this.ensureDirs();
    await this.load();
    this.registerFileWatcher();
  }

  destroy() {
    if (this.eventRef) {
      this.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
  }

  getNotes(): Note[] {
    return this.notes;
  }

  private async ensureDirs() {
    for (const dir of [NOTES_DIR, ARCHIVE_DIR]) {
      try {
        const exists = await this.app.vault.adapter.exists(dir);
        if (!exists) await this.app.vault.createFolder(dir);
      } catch (e) {
        console.error(`Hubstack: failed to create ${dir}`, e);
      }
    }
  }

  private registerFileWatcher() {
    this.eventRef = this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && this.isNoteFile(file.path)) {
        this.load();
      }
    });
    this.app.vault.on("create", (file) => {
      if (file instanceof TFile && this.isNoteFile(file.path)) {
        this.load();
      }
    });
    this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && this.isNoteFile(file.path)) {
        this.load();
      }
    });
  }

  private isNoteFile(path: string): boolean {
    return path.startsWith(NOTES_DIR + "/") || path.startsWith(ARCHIVE_DIR + "/");
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    try {
      const notes: Note[] = [];
      await this.collectNotes(NOTES_DIR, false, notes);
      await this.collectNotes(ARCHIVE_DIR, true, notes);
      this.notes = notes.sort(this.compareNotes);
      await this.notifyCallbacks();
    } finally {
      this.loading = false;
    }
  }

  private compareNotes(a: Note, b: Note): number {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  }

  private async collectNotes(dir: string, archived: boolean, out: Note[]) {
    let folder;
    try {
      folder = this.app.vault.getAbstractFileByPath(dir);
    } catch { return; }
    if (!folder || !("children" in folder)) return;
    for (const file of (folder as any).children as TFile[]) {
      if (file.extension !== "md") continue;
      const note = await this.parseNoteFile(file, archived);
      if (note) out.push(note);
    }
  }

  private async parseNoteFile(file: TFile, archived: boolean): Promise<Note | null> {
    try {
      const content = await this.app.vault.cachedRead(file);
      return parseNoteMarkdown(content, file.path, archived);
    } catch {
      return null;
    }
  }

  async addNote(title: string, body: string, tags: string[]): Promise<Note | null> {
    const id = Date.now().toString(36);
    const now = new Date().toISOString();
    const note: Note = {
      id,
      title: title.trim() || "无标题",
      body: body.trim(),
      tags: tags.map((t) => t.trim()).filter(Boolean),
      pinned: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      filePath: `${NOTES_DIR}/${id}.md`,
    };
    await this.writeNote(note);
    await this.load();
    return note;
  }

  async updateNote(id: string, patch: Partial<Pick<Note, "title" | "body" | "tags" | "pinned">>): Promise<void> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    const updated: Note = {
      ...note,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.writeNote(updated);
    await this.load();
  }

  async deleteNote(id: string): Promise<void> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    try {
      const file = this.app.vault.getFileByPath(note.filePath);
      if (file) await this.app.vault.delete(file);
    } catch (e) {
      console.error("Hubstack: failed to delete note", e);
    }
    await this.load();
  }

  async togglePin(id: string): Promise<void> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    await this.updateNote(id, { pinned: !note.pinned });
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const note = this.notes.find((n) => n.id === id);
    if (!note) return;
    if (note.archived === archived) return;
    const targetDir = archived ? ARCHIVE_DIR : NOTES_DIR;
    const newPath = `${targetDir}/${note.id}.md`;
    try {
      const file = this.app.vault.getFileByPath(note.filePath);
      if (file) await this.app.vault.rename(file, newPath);
    } catch (e) {
      console.error("Hubstack: failed to archive note", e);
    }
    await this.load();
  }

  private async writeNote(note: Note) {
    const content = serializeNoteMarkdown(note);
    try {
      const exists = await this.app.vault.adapter.exists(note.filePath);
      if (exists) {
        await this.app.vault.adapter.write(note.filePath, content);
      } else {
        await this.app.vault.create(note.filePath, content);
      }
    } catch (e) {
      console.error("Hubstack: failed to write note", e);
    }
  }

  private async notifyCallbacks() {
    for (const cb of this.callbacks) {
      try { await cb(this.notes); } catch (e) { console.error(e); }
    }
  }
}

export function parseNoteMarkdown(raw: string, filePath: string, archived: boolean): Note | null {
  const fm = parseFrontmatter(raw);
  const body = stripFrontmatter(raw);
  const id = fm.id || filePath.split("/").pop()?.replace(/\.md$/, "") || "";
  return {
    id: String(id),
    title: fm.title || body.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 50) || "无标题",
    body,
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    pinned: fm.pinned === true || fm.pinned === "true",
    archived,
    createdAt: fm.createdAt || new Date().toISOString(),
    updatedAt: fm.updatedAt || fm.createdAt || new Date().toISOString(),
    filePath,
  };
}

export function serializeNoteMarkdown(note: Note): string {
  const fm: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    tags: note.tags,
    pinned: note.pinned,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  const fmLines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      fmLines.push(`${k}: [${v.map((t) => JSON.stringify(t)).join(", ")}]`);
    } else if (typeof v === "string") {
      fmLines.push(`${k}: ${JSON.stringify(v)}`);
    } else {
      fmLines.push(`${k}: ${v}`);
    }
  }
  fmLines.push("---", "");
  return fmLines.join("\n") + note.body;
}

function parseFrontmatter(raw: string): Record<string, any> {
  const result: Record<string, any> = {};
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return result;
  const fmText = match[1];
  for (const line of fmText.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value: any = m[2];
    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        value = JSON.parse(value).map((x: any) => String(x));
      } catch {
        value = value.slice(1, -1).split(",").map((s: string) => s.trim());
      }
    } else if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { /* keep raw */ }
    }
    result[key] = value;
  }
  return result;
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

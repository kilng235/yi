import { App, TFile } from "obsidian";
import { Note } from "./types";

const NOTES_FILE = "hubstack/notes.md";
const LEGACY_JSON = "hubstack/notes.json";
const LEGACY_NOTES_DIR = "hubstack/notes";
const LEGACY_ARCHIVE_DIR = "hubstack/notes-archive";

export class NotesSync {
  private app: App;
  private notes: Note[] = [];
  private loading = false;
  private eventRef: any = null;
  private callbacks: Array<(notes: Note[]) => void | Promise<void>> = [];
  private suppressCallbacks = false;

  constructor(app: App) {
    this.app = app;
  }

  onChange(cb: (notes: Note[]) => void | Promise<void>) {
    this.callbacks.push(cb);
  }

  async init() {
    await this.ensureDir();
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

  private async ensureDir() {
    try {
      const dir = "hubstack";
      const exists = await this.app.vault.adapter.exists(dir);
      if (!exists) await this.app.vault.createFolder(dir);
    } catch (e) {
      console.error("Hubstack: failed to ensure hubstack dir", e);
    }
  }

  private registerFileWatcher() {
    this.eventRef = this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path === NOTES_FILE) {
        this.load();
      }
    });
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    try {
      const exists = await this.app.vault.adapter.exists(NOTES_FILE);
      if (exists) {
        const raw = await this.app.vault.adapter.read(NOTES_FILE);
        this.notes = parseNotesFile(raw).sort(this.compareNotes);
      } else {
        // Try migrating from legacy formats
        this.notes = await this.migrateFromLegacy();
        if (this.notes.length > 0) {
          await this.save();
        }
      }
      await this.notifyCallbacks();
    } finally {
      this.loading = false;
    }
  }

  private compareNotes(a: Note, b: Note): number {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  }

  private async save() {
    try {
      const content = serializeNotesFile(this.notes);
      await this.app.vault.adapter.write(NOTES_FILE, content);
    } catch (e) {
      console.error("Hubstack: failed to save notes.md", e);
    }
  }

  // --- Public API ---

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
      filePath: "",
    };
    this.notes.push(note);
    this.notes.sort(this.compareNotes);
    await this.save();
    await this.notifyCallbacks();
    return note;
  }

  async updateNote(id: string, patch: Partial<Pick<Note, "title" | "body" | "tags" | "pinned" | "archived">>): Promise<void> {
    const idx = this.notes.findIndex((n) => n.id === id);
    if (idx === -1) return;
    this.notes[idx] = {
      ...this.notes[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.notes.sort(this.compareNotes);
    await this.save();
    await this.notifyCallbacks();
  }

  async updateNoteSilent(id: string, patch: Partial<Pick<Note, "title" | "body" | "tags">>): Promise<void> {
    this.suppressCallbacks = true;
    try {
      await this.updateNote(id, patch);
    } finally {
      this.suppressCallbacks = false;
    }
  }

  async deleteNote(id: string): Promise<void> {
    this.notes = this.notes.filter((n) => n.id !== id);
    await this.save();
    await this.notifyCallbacks();
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
    await this.updateNote(id, { archived });
  }

  private async notifyCallbacks() {
    if (this.suppressCallbacks) return;
    for (const cb of this.callbacks) {
      try { await cb(this.notes); } catch (e) { console.error(e); }
    }
  }

  // --- Migration: legacy formats → single notes.md ---

  private async migrateFromLegacy(): Promise<Note[]> {
    const notes: Note[] = [];

    // 1. Try legacy JSON file
    try {
      const jsonExists = await this.app.vault.adapter.exists(LEGACY_JSON);
      if (jsonExists) {
        const raw = await this.app.vault.adapter.read(LEGACY_JSON);
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          for (const item of data) {
            notes.push({
              id: String(item.id || ""),
              title: item.title || "无标题",
              body: item.body || "",
              tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
              pinned: item.pinned === true,
              archived: item.archived === true,
              createdAt: item.createdAt || new Date().toISOString(),
              updatedAt: item.updatedAt || new Date().toISOString(),
              filePath: "",
            });
          }
          console.log(`Hubstack: migrated ${notes.length} notes from JSON`);
          await this.removeLegacyFile(LEGACY_JSON);
          return notes;
        }
      }
    } catch (e) {
      console.error("Hubstack: failed to migrate from JSON", e);
    }

    // 2. Try legacy .md directories
    await this.collectLegacyNotes(LEGACY_NOTES_DIR, false, notes);
    await this.collectLegacyNotes(LEGACY_ARCHIVE_DIR, true, notes);
    if (notes.length > 0) {
      console.log(`Hubstack: migrated ${notes.length} notes from .md dirs`);
      await this.cleanupLegacyDirs();
    }
    return notes;
  }

  private async collectLegacyNotes(dir: string, archived: boolean, out: Note[]) {
    let folder;
    try {
      folder = this.app.vault.getAbstractFileByPath(dir);
    } catch { return; }
    if (!folder || !("children" in folder)) return;
    for (const file of (folder as any).children as TFile[]) {
      if (file.extension !== "md") continue;
      try {
        const content = await this.app.vault.cachedRead(file);
        const note = parseNoteMarkdown(content, file.path, archived);
        if (note) {
          note.filePath = "";
          out.push(note);
        }
      } catch { /* skip unreadable files */ }
    }
  }

  private async cleanupLegacyDirs() {
    for (const dir of [LEGACY_NOTES_DIR, LEGACY_ARCHIVE_DIR]) {
      try {
        const folder = this.app.vault.getAbstractFileByPath(dir);
        if (folder) {
          const backupPath = `${dir}-backup-${Date.now().toString(36)}`;
          await this.app.vault.rename(folder as any, backupPath);
          console.log(`Hubstack: legacy dir "${dir}" → "${backupPath}"`);
        }
      } catch (e) {
        console.error(`Hubstack: failed to cleanup legacy dir ${dir}`, e);
      }
    }
  }

  private async removeLegacyFile(path: string) {
    try {
      const file = this.app.vault.getFileByPath(path);
      if (file) {
        const backupPath = `${path}.backup-${Date.now().toString(36)}`;
        await this.app.vault.rename(file, backupPath);
        console.log(`Hubstack: legacy file "${path}" → "${backupPath}"`);
      }
    } catch (e) {
      console.error(`Hubstack: failed to backup legacy file ${path}`, e);
    }
  }
}

// --- Notes file format (single .md with HTML comment delimiters) ---

const NOTE_START = /<!-- hubstack-note\n/g;
const NOTE_END = /<!-- \/hubstack-note -->/g;

export function parseNotesFile(raw: string): Note[] {
  const notes: Note[] = [];
  const startRe = new RegExp(NOTE_START.source, "g");
  let startMatch: RegExpExecArray | null;

  while ((startMatch = startRe.exec(raw)) !== null) {
    const metaStart = startMatch.index + startMatch[0].length;
    const endRe = new RegExp(NOTE_END.source, "g");
    endRe.lastIndex = metaStart;
    const endMatch = endRe.exec(raw);
    if (!endMatch) continue;

    const block = raw.slice(metaStart, endMatch.index);
    // First line(s) before the body are the JSON metadata
    const nlIdx = block.indexOf("\n");
    if (nlIdx === -1) continue;

    try {
      const meta = JSON.parse(block.slice(0, nlIdx));
      const body = block.slice(nlIdx + 1).trim();
      notes.push({
        id: String(meta.id || ""),
        title: meta.title || "无标题",
        body,
        tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
        pinned: meta.pinned === true,
        archived: meta.archived === true,
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: meta.updatedAt || new Date().toISOString(),
        filePath: "",
      });
    } catch (e) {
      console.error("Hubstack: failed to parse note block", e);
    }
  }

  return notes;
}

export function serializeNotesFile(notes: Note[]): string {
  if (notes.length === 0) return "";
  const parts: string[] = [];
  for (const note of notes) {
    const meta = JSON.stringify({
      id: note.id,
      title: note.title,
      tags: note.tags,
      pinned: note.pinned,
      archived: note.archived,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });
    parts.push(`<!-- hubstack-note\n${meta}\n${note.body}\n<!-- /hubstack-note -->`);
  }
  return parts.join("\n\n") + "\n";
}

// --- Standalone helpers (kept for backward compat / migration) ---

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

export function extractTagsFromBody(body: string): { cleanBody: string; tags: string[] } {
  const tagPattern = /#([\p{L}\p{N}_-]+)/gu;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body)) !== null) {
    if (!tags.includes(match[1])) tags.push(match[1]);
  }
  const cleanBody = body.replace(tagPattern, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  return { cleanBody, tags };
}

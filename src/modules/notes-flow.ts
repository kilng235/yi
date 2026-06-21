import { App } from "obsidian";
import { Note } from "../types";
import { NotesSync } from "../notes-sync";
import { NoteEditorModal } from "./note-editor-modal";

interface FlowState {
  searchQuery: string;
  activeTags: Set<string>;
  showArchived: boolean;
}

interface FlowCtx {
  app: App;
  sync: NotesSync;
  cleanupFns: Array<() => void>;
  notes: Note[];
}

export function renderNotesFlow(
  el: HTMLElement,
  app: App,
  sync: NotesSync,
  notes: Note[],
  cleanupFns: Array<() => void>,
  onStateChange: (render: () => void) => void
) {
  el.empty();
  el.addClass("nexus-notes-flow");

  const state: FlowState = {
    searchQuery: "",
    activeTags: new Set(),
    showArchived: false,
  };

  const ctx: FlowCtx = { app, sync, cleanupFns, notes };
  const rerender = () => {
    const grid = el.querySelector<HTMLElement>(".nexus-notes-grid");
    if (grid) grid.remove();
    const filtered = filterNotes(ctx.notes, state);
    renderFlowGrid(el, filtered, ctx, state.showArchived);
    const addBtn = el.querySelector<HTMLElement>(".nexus-notes-add-fab");
    if (addBtn) addBtn.remove();
    renderAddButton(el, ctx.app, ctx.sync);
  };

  renderToolbar(el, ctx, state, rerender);
  const filtered = filterNotes(notes, state);
  renderFlowGrid(el, filtered, ctx, state.showArchived);
  renderAddButton(el, app, sync);
}

function filterNotes(notes: Note[], state: FlowState): Note[] {
  return notes.filter((note) => {
    if (note.archived && !state.showArchived) return false;
    if (!note.archived && state.showArchived) return false;
    if (state.activeTags.size > 0) {
      const hasAll = Array.from(state.activeTags).every((t) => note.tags.includes(t));
      if (!hasAll) return false;
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const haystack = (note.title + " " + note.body + " " + note.tags.join(" ")).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function renderToolbar(
  el: HTMLElement,
  ctx: FlowCtx,
  state: FlowState,
  rerender: () => void
) {
  const toolbar = el.createDiv({ cls: "nexus-notes-toolbar" });

  const searchWrap = toolbar.createDiv({ cls: "nexus-notes-search" });
  const searchInput = searchWrap.createEl("input", {
    type: "text",
    placeholder: "搜索小记...",
    cls: "nexus-notes-search-input",
  }) as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value.trim();
    rerender();
  });

  const allTags = new Set<string>();
  for (const note of ctx.notes) {
    if (note.archived && !state.showArchived) continue;
    if (!note.archived && state.showArchived) continue;
    for (const t of note.tags) allTags.add(t);
  }

  const tagsRow = toolbar.createDiv({ cls: "nexus-notes-tags" });
  const sortedTags = Array.from(allTags).sort();
  for (const tag of sortedTags) {
    const chip = tagsRow.createEl("button", {
      cls: `nexus-notes-tag-chip${state.activeTags.has(tag) ? " nexus-notes-tag-chip--active" : ""}`,
      text: `#${tag}`,
    });
    chip.addEventListener("click", () => {
      if (state.activeTags.has(tag)) state.activeTags.delete(tag);
      else state.activeTags.add(tag);
      rerender();
      for (let i = 0; i < tagsRow.children.length; i++) {
        const c = tagsRow.children[i] as HTMLElement;
        const t = sortedTags[i];
        c.toggleClass("nexus-notes-tag-chip--active", state.activeTags.has(t));
      }
    });
  }

  const archiveToggle = toolbar.createEl("button", {
    cls: `nexus-notes-archive-toggle${state.showArchived ? " nexus-notes-archive-toggle--active" : ""}`,
    text: state.showArchived ? "查看归档" : "归档",
  });
  archiveToggle.addEventListener("click", () => {
    state.showArchived = !state.showArchived;
    state.activeTags.clear();
    state.searchQuery = "";
    (searchInput as HTMLInputElement).value = "";
    rerender();
  });
}

function renderFlowGrid(
  el: HTMLElement,
  notes: Note[],
  ctx: FlowCtx,
  isEmptyArchived: boolean = false
) {
  const grid = el.createDiv({ cls: "nexus-notes-grid" });

  if (notes.length === 0) {
    const empty = grid.createDiv({ cls: "nexus-notes-empty" });
    empty.createDiv({
      cls: "nexus-notes-empty-text",
      text: isEmptyArchived ? "归档空空如也" : "还没有小记",
    });
    empty.createDiv({
      cls: "nexus-notes-empty-hint",
      text: isEmptyArchived
        ? "归档的小记会在这里显示"
        : "点击右下角 + 按钮，或按 Ctrl+Enter 快速创建第一条小记",
    });
    return;
  }

  for (const note of notes) {
    renderNoteCard(grid, note, ctx);
  }
}

function renderNoteCard(
  el: HTMLElement,
  note: Note,
  ctx: FlowCtx
) {
  const { app, sync, cleanupFns } = ctx;
  const card = el.createDiv({ cls: "nexus-note-card" });
  if (note.pinned) card.addClass("nexus-note-card--pinned");

  const content = card.createDiv({ cls: "nexus-note-card-content" });

  const header = content.createDiv({ cls: "nexus-note-card-header" });
  if (note.pinned) {
    header.createSpan({ cls: "nexus-note-card-pin" });
  }
  header.createEl("h4", { text: note.title, cls: "nexus-note-card-title" });

  const menuBtn = header.createEl("button", {
    cls: "nexus-note-card-menu",
    attr: { "aria-label": "更多操作" },
    text: "⋯",
  });
  const menu = card.createDiv({ cls: "nexus-note-card-menu-popup nexus-note-card-menu-popup--hidden" });
  let menuOpen = false;

  const closeMenu = () => {
    menuOpen = false;
    menu.addClass("nexus-note-card-menu-popup--hidden");
  };

  const toggleMenu = (e: Event) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    menu.toggleClass("nexus-note-card-menu-popup--hidden", !menuOpen);
  };

  menuBtn.addEventListener("click", toggleMenu);

  const onDocClick = (e: Event) => {
    if (menuOpen && !menu.contains(e.target as Node) && e.target !== menuBtn) {
      closeMenu();
    }
  };
  document.addEventListener("click", onDocClick);
  cleanupFns.push(() => document.removeEventListener("click", onDocClick));

  const pinBtn = menu.createEl("button", { text: note.pinned ? "取消置顶" : "置顶" });
  pinBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeMenu();
    await sync.togglePin(note.id);
  });

  const archiveBtn = menu.createEl("button", {
    text: note.archived ? "取消归档" : "归档",
  });
  archiveBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeMenu();
    await sync.setArchived(note.id, !note.archived);
  });

  const editBtn = menu.createEl("button", { text: "编辑" });
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMenu();
    new NoteEditorModal(app, "edit", note, async (data) => {
      await sync.updateNote(note.id, data);
    }).open();
  });

  const deleteBtn = menu.createEl("button", { text: "删除", cls: "nexus-note-card-menu-delete" });
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeMenu();
    if (confirm(`确定删除「${note.title}」？`)) {
      await sync.deleteNote(note.id);
    }
  });

  if (note.body) {
    const body = content.createDiv({ cls: "nexus-note-card-body" });
    body.setText(note.body);
  }

  if (note.tags.length > 0) {
    const tags = content.createDiv({ cls: "nexus-note-card-tags" });
    for (const t of note.tags) {
      tags.createSpan({ text: `#${t}`, cls: "nexus-note-card-tag" });
    }
  }

  const footer = content.createDiv({ cls: "nexus-note-card-footer" });
  footer.createSpan({ text: formatDate(note.updatedAt), cls: "nexus-note-card-date" });

  card.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    new NoteEditorModal(app, "edit", note, async (data) => {
      await sync.updateNote(note.id, data);
    }).open();
  });
}

function renderAddButton(
  el: HTMLElement,
  app: App,
  sync: NotesSync
) {
  const addBtn = el.createDiv({ cls: "nexus-notes-add-fab" });
  addBtn.setAttribute("aria-label", "新建小记");
  addBtn.setAttribute("title", "新建小记 (Ctrl+Enter)");
  addBtn.addEventListener("click", () => {
    new NoteEditorModal(app, "create", null, async (data) => {
      await sync.addNote(data.title, data.body, data.tags);
    }).open();
  });
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 30) return `${days}天前`;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

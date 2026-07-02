import { App } from "obsidian";
import { Note } from "../types";
import { NotesSync, extractTagsFromBody } from "../notes-sync";
import { NoteEditorModal } from "./note-editor-modal";

const MASONRY_GAP = 14;
const MIN_CARD_WIDTH = 300;
const MAX_COLUMNS = 4;
const BODY_COLLAPSE_LENGTH = 360;
const TITLE_FALLBACK_LENGTH = 24;

interface FlowState {
  searchQuery: string;
  activeTags: Set<string>;
  showArchived: boolean;
  expandedIds: Set<string>;
  editingId: string | null;
}

interface FlowCtx {
  app: App;
  sync: NotesSync;
  cleanupFns: Array<() => void>;
  notes: Note[];
}

interface MasonryRefs {
  flowBody: HTMLElement;
  board: HTMLElement;
}

interface ToolbarRefs {
  refreshTags: () => void;
  resetSearch: () => void;
}

export function renderNotesFlow(
  el: HTMLElement,
  app: App,
  sync: NotesSync,
  notes: Note[],
  cleanupFns: Array<() => void>,
  _onStateChange: (render: () => void) => void
) {
  el.empty();
  el.addClass("nexus-notes-flow");

  const state: FlowState = {
    searchQuery: "",
    activeTags: new Set(),
    showArchived: false,
    expandedIds: new Set(),
    editingId: null,
  };

  const ctx: FlowCtx = { app, sync, cleanupFns, notes };
  const layout = el.createDiv({ cls: "nexus-notes-layout" });
  const flowBody = layout.createDiv({ cls: "nexus-notes-body" });
  const refs: MasonryRefs = {
    flowBody,
    board: flowBody.createDiv({ cls: "nexus-notes-board" }),
  };

  const renderBoard = () => {
    renderFlowBoard(refs, ctx, state);
  };

  const toolbarRefs = renderToolbar(el, ctx, state, renderBoard);
  renderActionSidebar(layout, app, sync, state, toolbarRefs, renderBoard);
  renderBoard();

  const scheduleRelayout = createRelayoutScheduler(renderBoard);
  const onRelayout = () => scheduleRelayout();
  el.addEventListener("hubstack:notes-relayout", onRelayout);
  const resizeObserver = new ResizeObserver(() => scheduleRelayout());
  resizeObserver.observe(flowBody);
  cleanupFns.push(() => {
    resizeObserver.disconnect();
    el.removeEventListener("hubstack:notes-relayout", onRelayout);
  });
}

function createRelayoutScheduler(renderBoard: () => void): () => void {
  let frameId = 0;
  return () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      renderBoard();
    });
  };
}

function renderFlowBoard(
  refs: MasonryRefs,
  ctx: FlowCtx,
  state: FlowState
) {
  refs.board.empty();

  const filtered = filterNotes(ctx.sync.getNotes(), state);
  const pinned = filtered.filter((note) => note.pinned);
  const regular = filtered.filter((note) => !note.pinned);

  if (pinned.length > 0) {
    renderPinnedFeatured(refs.board, pinned, ctx, state);
  }

  if (regular.length === 0) {
    if (pinned.length === 0) {
      renderEmptyState(refs.board, state.showArchived);
    }
    return;
  }

  renderMasonryBoard(refs.board, refs.flowBody, regular, ctx, state);
}

function filterNotes(notes: Note[], state: FlowState): Note[] {
  return notes.filter((note) => {
    if (note.archived && !state.showArchived) return false;
    if (!note.archived && state.showArchived) return false;
    if (state.activeTags.size > 0) {
      const hasAll = Array.from(state.activeTags).every((tag) => note.tags.includes(tag));
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
  rerenderBoard: () => void
): ToolbarRefs {
  const toolbar = el.createDiv({ cls: "nexus-notes-toolbar" });

  const searchWrap = toolbar.createDiv({ cls: "nexus-notes-search" });
  const searchInput = searchWrap.createEl("input", {
    type: "text",
    placeholder: "搜索小记、标签或关键词",
    cls: "nexus-notes-search-input",
  }) as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value.trim();
    rerenderBoard();
  });

  const tagsRow = toolbar.createDiv({ cls: "nexus-notes-tags" });
  const renderTags = () => {
    tagsRow.empty();
    const tags = collectVisibleTags(ctx.notes, state.showArchived);
    for (const tag of tags) {
      const chip = tagsRow.createEl("button", {
        cls: `nexus-notes-tag-chip${state.activeTags.has(tag) ? " nexus-notes-tag-chip--active" : ""}`,
        text: `#${tag}`,
      });
      chip.addEventListener("click", () => {
        if (state.activeTags.has(tag)) state.activeTags.delete(tag);
        else state.activeTags.add(tag);
        renderTags();
        rerenderBoard();
      });
    }
  };

  renderTags();
  return {
    refreshTags: renderTags,
    resetSearch: () => {
      state.searchQuery = "";
      searchInput.value = "";
    },
  };
}

function renderActionSidebar(
  layout: HTMLElement,
  app: App,
  sync: NotesSync,
  state: FlowState,
  toolbarRefs: ToolbarRefs,
  rerenderBoard: () => void
) {
  const sidePanel = layout.createDiv({ cls: "nexus-notes-sidepanel" });
  const actions = sidePanel.createDiv({ cls: "nexus-notes-sidepanel-group" });

  const addBtn = createSideButton(actions, {
    cls: "nexus-notes-sidebutton nexus-notes-sidebutton--primary",
    label: "新增",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    title: "新建小记 (Ctrl+Enter)",
  });
  addBtn.addEventListener("click", () => {
    new NoteEditorModal(app, "create", null, async (data) => {
      await sync.addNote(data.title, data.body, data.tags);
    }).open();
  });

  const archiveBtn = createSideButton(actions, {
    cls: `nexus-notes-sidebutton${state.showArchived ? " nexus-notes-sidebutton--active" : ""}`,
    label: state.showArchived ? "当前为归档视图" : "查看归档",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
    title: state.showArchived ? "切回未归档小记" : "查看归档小记",
  });
  archiveBtn.addEventListener("click", () => {
    state.showArchived = !state.showArchived;
    state.activeTags.clear();
    toolbarRefs.resetSearch();
    toolbarRefs.refreshTags();
    archiveBtn.toggleClass("nexus-notes-sidebutton--active", state.showArchived);
    archiveBtn.setAttribute("aria-label", state.showArchived ? "当前为归档视图" : "查看归档");
    archiveBtn.setAttribute("title", state.showArchived ? "切回未归档小记" : "查看归档小记");
    rerenderBoard();
  });
}

function createSideButton(
  host: HTMLElement,
  options: {
    cls: string;
    label: string;
    svg: string;
    title: string;
  }
) {
  const button = host.createEl("button", {
    cls: options.cls,
    attr: { type: "button", title: options.title, "aria-label": options.label },
  });
  button.innerHTML = options.svg;
  return button;
}

function collectVisibleTags(notes: Note[], showArchived: boolean): string[] {
  const allTags = new Set<string>();
  for (const note of notes) {
    if (note.archived !== showArchived) continue;
    for (const tag of note.tags) allTags.add(tag);
  }
  return Array.from(allTags).sort((a, b) => a.localeCompare(b));
}

function renderBoardHeader(container: HTMLElement, totalCount: number) {
  const header = container.createDiv({ cls: "nexus-notes-board-header" });
  const title = header.createDiv({ cls: "nexus-notes-board-title" });
  title.createSpan({ cls: "nexus-notes-board-title-main", text: "NOT" });
  title.createSpan({ cls: "nexus-notes-board-title-accent", text: "ES" });
  header.createDiv({ cls: "nexus-notes-board-subtitle", text: "Hubstack / 小记板块" });
}

function renderPinnedFeatured(
  container: HTMLElement,
  notes: Note[],
  ctx: FlowCtx,
  state: FlowState
) {
  const section = container.createDiv({ cls: "nexus-notes-featured" });

  // Left: heading
  const left = section.createDiv({ cls: "nexus-notes-featured-left" });
  left.createDiv({ cls: "nexus-notes-featured-label", text: "PINNED" });
  left.createDiv({ cls: "nexus-notes-featured-heading", text: "置顶小记" });
  left.createDiv({ cls: "nexus-notes-featured-hint", text: `${notes.length} 条已置顶 · 点击卡片展开编辑` });

  // Right: first pinned note as featured card
  const featured = notes[0];
  const isEditingFeatured = state.editingId === featured.id;

  if (isEditingFeatured) {
    // Render standard edit card in place of the featured layout
    renderNoteCard(section, featured, ctx, state, { pinnedLayout: false });
  } else {
    const card = section.createDiv({ cls: "nexus-notes-featured-card" });

    // Header row: PINNED tag + menu button
    const topRow = card.createDiv({ cls: "nexus-notes-featured-card-toprow" });
    topRow.createDiv({ cls: "nexus-notes-featured-card-tag", text: "PINNED" });

    const { cleanupFns } = ctx;
    const menuBtn = topRow.createEl("button", {
      cls: "nexus-note-card-menu",
      attr: { "aria-label": "更多操作", type: "button" },
      text: "⋯",
    });
    const menu = card.createDiv({ cls: "nexus-note-card-menu-popup nexus-note-card-menu-popup--hidden" });
    let menuOpen = false;
    const closeMenu = () => {
      menuOpen = false;
      menu.addClass("nexus-note-card-menu-popup--hidden");
    };
    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      menuOpen = !menuOpen;
      menu.toggleClass("nexus-note-card-menu-popup--hidden", !menuOpen);
    });
    const onDocClick = (event: Event) => {
      if (menuOpen && !menu.contains(event.target as Node) && event.target !== menuBtn) {
        closeMenu();
      }
    };
    document.addEventListener("click", onDocClick);
    cleanupFns.push(() => document.removeEventListener("click", onDocClick));

    const pinBtn = menu.createEl("button", { text: "取消置顶" });
    pinBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      closeMenu();
      await ctx.sync.togglePin(featured.id);
    });
    const archiveBtn = menu.createEl("button", { text: featured.archived ? "取消归档" : "归档" });
    archiveBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      closeMenu();
      await ctx.sync.setArchived(featured.id, !featured.archived);
    });
    const deleteBtn = menu.createEl("button", { text: "删除", cls: "nexus-note-card-menu-delete" });
    deleteBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      closeMenu();
      await ctx.sync.deleteNote(featured.id);
    });

    card.createDiv({ cls: "nexus-notes-featured-card-title", text: getDisplayTitle(featured) });
    if (featured.body) {
      const body = card.createDiv({ cls: "nexus-notes-featured-card-body" });
      body.setText(featured.body.length > 120 ? featured.body.slice(0, 120) + "…" : featured.body);
    }

    // Metrics row
    const metrics = card.createDiv({ cls: "nexus-notes-featured-card-metrics" });
    const m1 = metrics.createDiv({ cls: "nexus-notes-featured-metric" });
    m1.createDiv({ cls: "nexus-notes-featured-metric-value", text: `${featured.body.length}` });
    m1.createDiv({ cls: "nexus-notes-featured-metric-label", text: "字数" });
    const m2 = metrics.createDiv({ cls: "nexus-notes-featured-metric" });
    m2.createDiv({ cls: "nexus-notes-featured-metric-value", text: `${notes.length}` });
    m2.createDiv({ cls: "nexus-notes-featured-metric-label", text: "置顶" });
    const m3 = metrics.createDiv({ cls: "nexus-notes-featured-metric" });
    m3.createDiv({ cls: "nexus-notes-featured-metric-value", text: formatDate(featured.updatedAt) });
    m3.createDiv({ cls: "nexus-notes-featured-metric-label", text: "更新" });

    // Arrow
    card.createDiv({ cls: "nexus-notes-featured-card-arrow", text: "→" });

    // Click to edit (skip if clicking a button)
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      enterEditMode(featured, state, card);
    });
  }

  // Remaining pinned notes as compact cards below
  if (notes.length > 1) {
    const rest = container.createDiv({ cls: "nexus-notes-pinned-rest" });
    for (let i = 1; i < notes.length; i++) {
      renderNoteCard(rest, notes[i], ctx, state, { pinnedLayout: false });
    }
  }
}

function renderCounterRow(container: HTMLElement, count: number) {
  const row = container.createDiv({ cls: "nexus-notes-counter-row" });
  const counter = row.createDiv({ cls: "nexus-notes-counter" });
  counter.createEl("strong", { text: String(count).padStart(2, "0") });
  counter.createSpan({ text: ` 条小记` });
}

function renderMasonryBoard(
  container: HTMLElement,
  viewport: HTMLElement,
  notes: Note[],
  ctx: FlowCtx,
  state: FlowState
) {
  const board = container.createDiv({ cls: "nexus-notes-masonry" });
  const columnCount = getColumnCount(viewport.clientWidth || viewport.offsetWidth || 0);
  const columns: HTMLElement[] = [];
  const heights = Array.from({ length: columnCount }, () => 0);

  for (let i = 0; i < columnCount; i++) {
    columns.push(board.createDiv({ cls: "nexus-notes-column" }));
  }

  for (const note of notes) {
    const card = renderNoteCard(null, note, ctx, state);
    const targetIndex = findShortestColumnIndex(heights);
    columns[targetIndex].appendChild(card);
    heights[targetIndex] += card.offsetHeight + MASONRY_GAP;
  }
}

function renderEmptyState(container: HTMLElement, isArchived: boolean) {
  const empty = container.createDiv({ cls: "nexus-notes-empty" });
  empty.createDiv({
    cls: "nexus-notes-empty-text",
    text: isArchived ? "归档空空如也" : "还没有小记",
  });
  empty.createDiv({
    cls: "nexus-notes-empty-hint",
    text: isArchived
      ? "归档后的小记会继续留在这里"
      : "点击右下角 + 按钮，或者用 Ctrl+Enter 快速写下第一条随手记",
  });
}

function getColumnCount(containerWidth: number): number {
  if (!containerWidth) return 1;
  return Math.max(
    1,
    Math.min(MAX_COLUMNS, Math.floor((containerWidth + MASONRY_GAP) / (MIN_CARD_WIDTH + MASONRY_GAP)))
  );
}

function findShortestColumnIndex(heights: number[]): number {
  let index = 0;
  let min = heights[0] ?? 0;
  for (let i = 1; i < heights.length; i++) {
    if (heights[i] < min) {
      min = heights[i];
      index = i;
    }
  }
  return index;
}

function renderNoteCard(
  host: HTMLElement | null,
  note: Note,
  ctx: FlowCtx,
  state: FlowState,
  options: { pinnedLayout?: boolean } = {}
): HTMLElement {
  const card = document.createElement("article");
  card.addClass("nexus-note-card");
  if (note.pinned) card.addClass("nexus-note-card--pinned");
  if (options.pinnedLayout) card.addClass("nexus-note-card--pinned-layout");

  const isEditing = state.editingId === note.id;
  if (isEditing) card.addClass("nexus-note-card--editing");

  if (isEditing) {
    renderNoteCardEdit(card, note, ctx, state);
  } else {
    renderNoteCardDisplay(card, note, ctx, state);
  }

  if (host) host.appendChild(card);
  return card;
}

function renderNoteCardDisplay(
  card: HTMLElement,
  note: Note,
  ctx: FlowCtx,
  state: FlowState
) {
  const { sync, cleanupFns } = ctx;
  const content = card.createDiv({ cls: "nexus-note-card-content" });

  // Top label
  const topLabel = content.createDiv({ cls: "nexus-note-card-toplabel" });
  topLabel.setText("笔记");

  // Header: title + menu
  const header = content.createDiv({ cls: "nexus-note-card-header" });

  const titleWrap = header.createDiv({ cls: "nexus-note-card-title-wrap" });
  const derivedTitle = getDisplayTitle(note);
  const isGeneratedTitle = !note.title.trim();
  titleWrap.createEl("h4", {
    text: derivedTitle,
    cls: `nexus-note-card-title${isGeneratedTitle ? " nexus-note-card-title--generated" : ""}`,
  });

  const menuBtn = header.createEl("button", {
    cls: "nexus-note-card-menu",
    attr: { "aria-label": "更多操作", type: "button" },
    text: "⋯",
  });

  const menu = card.createDiv({ cls: "nexus-note-card-menu-popup nexus-note-card-menu-popup--hidden" });
  let menuOpen = false;

  const closeMenu = () => {
    menuOpen = false;
    menu.addClass("nexus-note-card-menu-popup--hidden");
  };

  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    menuOpen = !menuOpen;
    menu.toggleClass("nexus-note-card-menu-popup--hidden", !menuOpen);
  });

  const onDocClick = (event: Event) => {
    if (menuOpen && !menu.contains(event.target as Node) && event.target !== menuBtn) {
      closeMenu();
    }
  };
  document.addEventListener("click", onDocClick);
  cleanupFns.push(() => document.removeEventListener("click", onDocClick));

  const pinBtn = menu.createEl("button", { text: note.pinned ? "取消置顶" : "置顶" });
  pinBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    closeMenu();
    await sync.togglePin(note.id);
  });

  const archiveBtn = menu.createEl("button", {
    text: note.archived ? "取消归档" : "归档",
  });
  archiveBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    closeMenu();
    await sync.setArchived(note.id, !note.archived);
  });

  const editBtn = menu.createEl("button", { text: "编辑" });
  editBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    closeMenu();
    enterEditMode(note, state, card);
  });

  const deleteBtn = menu.createEl("button", { text: "删除", cls: "nexus-note-card-menu-delete" });
  deleteBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    closeMenu();
    await sync.deleteNote(note.id);
  });

  // Body
  if (note.body) {
    const body = content.createDiv({ cls: "nexus-note-card-body" });
    const shouldCollapse = note.body.length > BODY_COLLAPSE_LENGTH;
    const isExpanded = state.expandedIds.has(note.id);
    body.setText(note.body);
    if (shouldCollapse && !isExpanded) {
      body.addClass("nexus-note-card-body--collapsed");
    }
    if (shouldCollapse) {
      const toggle = content.createEl("button", {
        cls: "nexus-note-card-expand",
        attr: { type: "button" },
        text: isExpanded ? "收起" : "展开全文",
      });
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.expandedIds.has(note.id)) state.expandedIds.delete(note.id);
        else state.expandedIds.add(note.id);
        rerenderClosestBoard(card);
      });
    }
  }

  // Metrics footer row — display tags directly, left-aligned
  const footer = content.createDiv({ cls: "nexus-note-card-footer nexus-note-card-metrics" });
  footer.style.justifyContent = "flex-start";
  footer.style.borderTop = "none";
  footer.style.paddingTop = "0";
  footer.style.gap = "8px";
  if (note.tags.length > 0) {
    footer.createSpan({ text: note.tags.map((t) => `#${t}`).join(" "), style: "font-size:14px;font-weight:700;color:var(--nx-text);letter-spacing:-0.01em;line-height:1.2" });
  }

  // Arrow indicator
  content.createDiv({ cls: "nexus-note-card-arrow", text: "→" });

  card.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    enterEditMode(note, state, card);
  });
}

function renderNoteCardEdit(
  card: HTMLElement,
  note: Note,
  ctx: FlowCtx,
  state: FlowState
) {
  const { sync, cleanupFns } = ctx;
  const content = card.createDiv({ cls: "nexus-note-card-content" });

  const header = content.createDiv({ cls: "nexus-note-card-header" });

  const titleWrap = header.createDiv({ cls: "nexus-note-card-title-wrap" });
  const titleInput = titleWrap.createEl("textarea", {
    cls: "nexus-note-card-title-input",
    attr: { rows: "1", placeholder: "无标题" },
  }) as HTMLTextAreaElement;
  titleInput.value = note.title.trim();

  // Build initial body value: body + existing tags appended
  const tagSuffix = note.tags.length > 0
    ? "\n\n" + note.tags.map((t) => `#${t}`).join(" ")
    : "";
  const bodyInput = content.createEl("textarea", {
    cls: "nexus-note-card-body-input",
    attr: { placeholder: "写点什么..." },
  }) as HTMLTextAreaElement;
  bodyInput.value = note.body + tagSuffix;

  // Live tag preview container
  const tagsContainer = content.createDiv({ cls: "nexus-note-card-tags nexus-note-card-tags--live" });

  const refreshTagPreview = () => {
    tagsContainer.empty();
    const { tags } = extractTagsFromBody(bodyInput.value);
    for (const tag of tags) {
      tagsContainer.createSpan({ text: `#${tag}`, cls: "nexus-note-card-tag" });
    }
  };
  refreshTagPreview();

  // Footer with edit hint
  const footer = content.createDiv({ cls: "nexus-note-card-footer" });
  footer.createSpan({
    cls: "nexus-note-card-edit-hint",
    text: "Ctrl+Enter 保存 · Esc 退出",
  });

  // Auto-resize helper
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  // Initial auto-resize
  setTimeout(() => {
    autoResize(titleInput);
    autoResize(bodyInput);
    bodyInput.focus();
    const len = bodyInput.value.length;
    bodyInput.setSelectionRange(len, len);
  }, 0);

  // Input events: auto-resize + live tag preview
  titleInput.addEventListener("input", () => autoResize(titleInput));
  bodyInput.addEventListener("input", () => {
    autoResize(bodyInput);
    refreshTagPreview();
  });

  // Save and exit function
  let saved = false;
  const saveAndExit = async () => {
    if (saved) return;
    if (state.editingId !== note.id) return;
    saved = true;

    const rawBody = bodyInput.value;
    const { cleanBody, tags } = extractTagsFromBody(rawBody);
    const title = titleInput.value.trim();

    state.editingId = null;

    // Dirty check: skip save if nothing changed
    const titleSame = title === note.title;
    const bodySame = cleanBody === note.body;
    const tagsSame = arraysEqual(tags, note.tags);

    if (titleSame && bodySame && tagsSame) {
      rerenderClosestBoard(card);
      return;
    }

    if (!title && !cleanBody) {
      rerenderClosestBoard(card);
      return;
    }

    await sync.updateNoteSilent(note.id, { title, body: cleanBody, tags });
    rerenderClosestBoard(card);
  };

  // Exit triggers: mousedown outside
  const onDocMouseDown = (event: MouseEvent) => {
    if (!card.isConnected) {
      document.removeEventListener("mousedown", onDocMouseDown);
      return;
    }
    if (card.contains(event.target as Node)) return;
    saveAndExit();
  };
  document.addEventListener("mousedown", onDocMouseDown);
  cleanupFns.push(() => document.removeEventListener("mousedown", onDocMouseDown));

  // Exit triggers: keyboard shortcuts
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveAndExit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      saveAndExit();
      return;
    }
    // Enter in title → jump to body
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && event.target === titleInput) {
      event.preventDefault();
      bodyInput.focus();
    }
  };
  titleInput.addEventListener("keydown", onKeyDown);
  bodyInput.addEventListener("keydown", onKeyDown);
}

function enterEditMode(note: Note, state: FlowState, card: HTMLElement) {
  if (state.editingId === note.id) return;
  state.editingId = note.id;
  rerenderClosestBoard(card);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

function rerenderClosestBoard(card: HTMLElement) {
  const flow = card.closest(".nexus-notes-flow");
  if (!flow) return;
  flow.dispatchEvent(new Event("hubstack:notes-relayout"));
}

function getDisplayTitle(note: Note): string {
  const title = note.title.trim();
  if (title) return title;
  const compact = note.body.replace(/\s+/g, " ").trim();
  if (!compact) return "无标题";
  if (compact.length <= TITLE_FALLBACK_LENGTH) return compact;
  return `${compact.slice(0, TITLE_FALLBACK_LENGTH)}…`;
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 30) return `${days} 天前`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

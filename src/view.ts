import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import NexusPlugin from "./main";
import { KanbanData, NexusSettings } from "./types";
import { KanbanSync } from "./kanban-sync";
import { renderBanner } from "./modules/banner";
import { renderKanban } from "./modules/kanban";
import { renderTodo } from "./modules/todo";
import { renderHeatmap } from "./modules/heatmap";
import { renderBookshelf } from "./modules/bookshelf";
import { setupDraggableGrid } from "./grid";

export const NEXUS_VIEW_TYPE = "nexus-view";

export class NexusView extends ItemView {
  plugin: NexusPlugin;
  kanbanSync: KanbanSync;
  kanbanData: KanbanData | null = null;
  cleanupFns: Array<() => void> = [];

  constructor(leaf: WorkspaceLeaf, plugin: NexusPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.kanbanSync = new KanbanSync(this.app, plugin.settings);
  }

  getViewType(): string {
    return NEXUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Nexus";
  }

  getIcon(): string {
    return "home";
  }

  async onOpen() {
    this.kanbanSync.updateSettings(this.plugin.settings);
    this.kanbanSync.setActivityCallback((type: string) => {
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const log = this.plugin.settings.activityLog;
      if (!log[key]) log[key] = { cardComplete: 0, todoCheck: 0, cardCreate: 0 };
      if (type === "todoCheck") log[key].todoCheck++;
      if (type === "cardComplete") log[key].cardComplete++;
      if (type === "cardCreate") log[key].cardCreate++;
      this.plugin.saveSettings();
    });
    this.kanbanSync.onDataUpdate((data) => {
      this.kanbanData = data;
      this.render();
    });
    await this.kanbanSync.init();
    this.registerVaultListeners();
  }

  async onClose() {
    this.runCleanup();
    this.unregisterVaultListeners();
    this.kanbanSync.destroy();
  }

  registerVaultListeners() {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "epub") this.render();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile && file.extension === "epub") this.render();
      })
    );
  }

  unregisterVaultListeners() {
    // Events auto-unregister via this.registerEvent
  }

  runCleanup() {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }

  render() {
    this.runCleanup();
    const container = this.contentEl;
    container.empty();
    container.addClass("nexus-root");

    const settings = this.plugin.settings;

    // Banner
    const bannerEl = container.createDiv({ cls: "nexus-banner" });
    renderBanner(bannerEl, settings, this.app);

    // Grid
    const gridEl = container.createDiv({ cls: "nexus-grid" });
    container.setAttribute("data-theme", settings.stylePreset);

    const modules: Record<string, HTMLElement> = {};
    for (const cell of settings.gridLayout) {
      const cellEl = gridEl.createDiv({ cls: "nexus-cell" });
      cellEl.dataset.moduleId = cell.id;
      cellEl.style.gridColumn = `${cell.x + 1} / span ${cell.w}`;
      cellEl.style.gridRow = `${cell.y + 1} / span ${cell.h}`;
      modules[cell.id] = cellEl;
    }

    // Render each module
    if (modules["kanban"] && this.kanbanData) {
      renderKanban(modules["kanban"], this.kanbanData, this.kanbanSync, this.app, this.cleanupFns);
    }
    if (modules["todo"] && this.kanbanData) {
      renderTodo(modules["todo"], this.kanbanData, this.kanbanSync, this.app, this.cleanupFns);
    }
    if (modules["heatmap"]) {
      renderHeatmap(modules["heatmap"], settings);
    }
    if (modules["bookshelf"]) {
      renderBookshelf(modules["bookshelf"], this.app, this.plugin);
    }

    // Setup draggable grid
    setupDraggableGrid(gridEl, settings, async (newLayout) => {
      settings.gridLayout = newLayout;
      await this.plugin.saveSettings();
    });
  }
}

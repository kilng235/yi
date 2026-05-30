import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import NexusPlugin from "./main";
import { KanbanData } from "./types";
import { KanbanSync } from "./kanban-sync";
import { renderBanner, cleanupBanner } from "./modules/banner";
import { renderSidebar } from "./modules/sidebar";
import { renderTodo } from "./modules/todo";
import { renderHeatmap } from "./modules/heatmap";
import { renderBookshelf } from "./modules/bookshelf";

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

  getViewType(): string { return NEXUS_VIEW_TYPE; }
  getDisplayText(): string { return "Nexus"; }
  getIcon(): string { return "home"; }

  async onOpen() {
    this.kanbanSync.updateSettings(this.plugin.settings);
    this.kanbanSync.setActivityCallback((type: string) => {
      const today = new Date();
      const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const log = this.plugin.settings.activityLog;
      if (!log[key]) log[key] = { cardComplete: 0, todoCheck: 0, cardCreate: 0, noteEdit: 0, noteCreate: 0 };
      if (type === "todoCheck") log[key].todoCheck++;
      if (type === "cardComplete") log[key].cardComplete++;
      if (type === "cardCreate") log[key].cardCreate++;
      if (type === "noteEdit") log[key].noteEdit++;
      if (type === "noteCreate") log[key].noteCreate++;
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
    this.kanbanSync.destroy();
  }

  registerVaultListeners() {
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "epub") this.render();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof TFile && file.extension === "epub") this.render();
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") this.recordActivity("noteCreate");
    }));
    let editDebounce: ReturnType<typeof setTimeout> | null = null;
    this.cleanupFns.push(() => { if (editDebounce) clearTimeout(editDebounce); });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      const kanbanPath = this.plugin.settings.kanbanFile.trim();
      const kanbanFile = kanbanPath.endsWith(".md") ? kanbanPath : `${kanbanPath}.md`;
      if (file.path === kanbanFile || file.path.includes(".obsidian/plugins/nexus")) return;
      if (editDebounce) clearTimeout(editDebounce);
      editDebounce = setTimeout(() => this.recordActivity("noteEdit"), 5000);
    }));
  }

  private recordActivity(type: string) {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const log = this.plugin.settings.activityLog;
    if (!log[key]) log[key] = { cardComplete: 0, todoCheck: 0, cardCreate: 0, noteEdit: 0, noteCreate: 0 };
    if (type === "noteEdit") log[key].noteEdit++;
    if (type === "noteCreate") log[key].noteCreate++;
    this.plugin.saveSettings();
  }

  runCleanup() {
    const oldBanner = this.contentEl.querySelector(".nexus-banner") as HTMLElement;
    if (oldBanner) cleanupBanner(oldBanner);
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }

  render() {
    this.runCleanup();
    const container = this.contentEl;
    container.empty();
    container.addClass("nexus-root");
    container.setAttribute("data-theme", this.plugin.settings.stylePreset);

    // Banner
    const bannerEl = container.createDiv({ cls: "nexus-banner" });
    if (this.plugin.settings.bannerHeight) {
      bannerEl.style.minHeight = `${this.plugin.settings.bannerHeight}px`;
    }
    renderBanner(bannerEl, this.plugin.settings, this.app);

    // Two-column layout
    const body = container.createDiv({ cls: "nexus-body" });

    // Left sidebar
    const sidebar = body.createDiv({ cls: "nexus-left-sidebar" });
    renderSidebar(sidebar, this.app, this.plugin, this.cleanupFns);

    // Right main content
    const main = body.createDiv({ cls: "nexus-main" });

    // To-Do section
    const todoSection = main.createDiv({ cls: "nexus-section" });
    const todoHeader = todoSection.createDiv({ cls: "nexus-section-header" });
    todoHeader.createDiv({ cls: "nexus-section-dot nexus-section-dot--red" });
    todoHeader.createEl("span", { text: "待办事项", cls: "nexus-section-title" });
    const todoBody = todoSection.createDiv({ cls: "nexus-section-body" });
    if (this.kanbanData) {
      renderTodo(todoBody, this.kanbanData, this.kanbanSync, this.app, this.cleanupFns);
    }

    // Heatmap section
    const heatmapSection = main.createDiv({ cls: "nexus-section" });
    const heatmapHeader = heatmapSection.createDiv({ cls: "nexus-section-header" });
    heatmapHeader.createDiv({ cls: "nexus-section-dot nexus-section-dot--yellow" });
    heatmapHeader.createEl("span", { text: "活跃度", cls: "nexus-section-title" });
    const heatmapBody = heatmapSection.createDiv({ cls: "nexus-section-body" });
    renderHeatmap(heatmapBody, this.plugin.settings);

    // Bookshelf section
    const bookSection = main.createDiv({ cls: "nexus-section" });
    const bookHeader = bookSection.createDiv({ cls: "nexus-section-header" });
    bookHeader.createDiv({ cls: "nexus-section-dot nexus-section-dot--blue" });
    bookHeader.createEl("span", { text: "书架", cls: "nexus-section-title" });
    const bookBody = bookSection.createDiv({ cls: "nexus-section-body" });
    renderBookshelf(bookBody, this.app, this.plugin, this.cleanupFns);
  }
}

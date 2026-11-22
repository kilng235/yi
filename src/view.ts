import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import HubstackPlugin from "./main";
import { KanbanData, Note } from "./types";
import { KanbanSync } from "./kanban-sync";
import { NotesSync } from "./notes-sync";
import { renderBanner, cleanupBanner } from "./modules/banner";
import { renderSidebar } from "./modules/sidebar";
import { renderTodo } from "./modules/todo";
import { renderHeatmap } from "./modules/heatmap";
import { renderBookshelf } from "./modules/bookshelf";
import { renderTabBar, TabId } from "./modules/tab-bar";
import { renderNotesFlow } from "./modules/notes-flow";
import { loadActivityLog, saveActivityLog, todayKey, ActivityLog } from "./activity-log";
import { renderExamTab } from "./modules/exam";

export const HUBSTACK_VIEW_TYPE = "hubstack-view";

export class HubstackView extends ItemView {
  plugin: HubstackPlugin;
  kanbanSync: KanbanSync;
  notesSync: NotesSync;
  kanbanData: KanbanData | null = null;
  notes: Note[] = [];
  cleanupFns: Array<() => void> = [];
  activityLog: ActivityLog = {};

  constructor(leaf: WorkspaceLeaf, plugin: HubstackPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.kanbanSync = new KanbanSync(this.app, plugin.settings);
    this.notesSync = new NotesSync(this.app);
  }

  getViewType(): string { return HUBSTACK_VIEW_TYPE; }
  getDisplayText(): string { return "Hubstack"; }
  getIcon(): string { return "home"; }

  async onOpen() {
    this.contentEl.addClass("hubstack-root");
    try {
      await this.bootstrap();
    } catch (e) {
      console.error("[hubstack] onOpen failed:", e);
      this.renderFatalError(e);
    }
  }

  /** 初始化数据/订阅并首次渲染 */
  private async bootstrap(): Promise<void> {
    this.kanbanSync.updateSettings(this.plugin.settings);
    this.activityLog = await loadActivityLog(this.app);
    this.kanbanSync.setActivityCallback((type: string) => {
      const key = todayKey();
      if (!this.activityLog[key]) {
        this.activityLog[key] = { cardComplete: 0, todoCheck: 0, cardCreate: 0, noteEdit: 0, noteCreate: 0 };
      }
      if (type === "todoCheck") this.activityLog[key].todoCheck++;
      if (type === "todoUncheck") this.activityLog[key].todoCheck = Math.max(0, this.activityLog[key].todoCheck - 1);
      if (type === "cardComplete") this.activityLog[key].cardComplete++;
      if (type === "cardCreate") this.activityLog[key].cardCreate++;
      if (type === "noteEdit") this.activityLog[key].noteEdit++;
      if (type === "noteCreate") this.activityLog[key].noteCreate++;
      saveActivityLog(this.app, this.activityLog);
    });
    this.kanbanSync.onDataUpdate(async (data) => {
      this.kanbanData = data;
      if (this.plugin.settings.activeTab === "dashboard") await this.render();
    });
    this.notesSync.onChange(async (notes) => {
      this.notes = notes;
      if (this.plugin.settings.activeTab === "notes") await this.render();
    });
    this.plugin.examStats.onQuizAnswered = (n: number) => {
      const key = todayKey();
      if (!this.activityLog[key]) {
        this.activityLog[key] = { cardComplete: 0, todoCheck: 0, cardCreate: 0, noteEdit: 0, noteCreate: 0 };
      }
      this.activityLog[key].quizAnswer = (this.activityLog[key].quizAnswer ?? 0) + n;
      saveActivityLog(this.app, this.activityLog);
    };
    await this.kanbanSync.init();
    await this.notesSync.init();
    this.registerVaultListeners();
    await this.render();
  }

  /**
   * 当 bootstrap 抛错时,在视图里显示错误信息,避免静默白屏
   */
  private renderFatalError(e: unknown): void {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const stack = e instanceof Error && e.stack ? e.stack : "";
    this.contentEl.empty();
    this.contentEl.addClass("hubstack-fatal");
    const wrap = this.contentEl.createDiv({ cls: "hubstack-fatal-wrap" });
    wrap.createEl("h2", { text: "⚠️ Hubstack 加载失败" });
    wrap.createEl("p", { text: msg });
    if (stack) {
      const pre = wrap.createEl("pre", { cls: "hubstack-fatal-stack" });
      pre.textContent = stack;
    }
    const btn = wrap.createEl("button", {
      text: "重试",
      cls: "mod-cta",
    });
    btn.addEventListener("click", async () => {
      this.contentEl.empty();
      this.contentEl.removeClass("hubstack-fatal");
      await this.onOpen();
    });
  }

  async onClose() {
    this.runCleanup();
    this.kanbanSync.destroy();
    this.notesSync.destroy();
  }

  registerVaultListeners() {
    const isHubstackInternal = (path: string) =>
      path.startsWith("hubstack/") || path.includes(".obsidian/plugins/hubstack");

    this.registerEvent(this.app.vault.on("create", async (file) => {
      if (file instanceof TFile && file.extension === "epub") await this.render();
    }));
    this.registerEvent(this.app.vault.on("delete", async (file) => {
      if (file instanceof TFile && file.extension === "epub") await this.render();
    }));
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      if (isHubstackInternal(file.path)) return;
      this.recordActivity("noteCreate");
    }));
    let editDebounce: ReturnType<typeof setTimeout> | null = null;
    this.cleanupFns.push(() => { if (editDebounce) clearTimeout(editDebounce); });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") return;
      if (isHubstackInternal(file.path)) return;
      if (editDebounce) clearTimeout(editDebounce);
      editDebounce = setTimeout(() => this.recordActivity("noteEdit"), 5000);
    }));
  }

  private recordActivity(type: string) {
    const key = todayKey();
    if (!this.activityLog[key]) {
      this.activityLog[key] = { cardComplete: 0, todoCheck: 0, cardCreate: 0, noteEdit: 0, noteCreate: 0 };
    }
    if (type === "noteEdit") this.activityLog[key].noteEdit++;
    if (type === "noteCreate") this.activityLog[key].noteCreate++;
    saveActivityLog(this.app, this.activityLog);
  }

  runCleanup() {
    const oldBanner = this.contentEl.querySelector(".hubstack-banner") as HTMLElement;
    if (oldBanner) cleanupBanner(oldBanner);
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns = [];
  }

  async setActiveTab(tab: TabId) {
    if (this.plugin.settings.activeTab === tab) return;
    this.plugin.settings.activeTab = tab;
    await this.plugin.saveSettings();
    await this.render();
  }

  async render() {
    this.runCleanup();
    const container = this.contentEl;
    container.empty();
    container.addClass("hubstack-root");
    container.setAttribute("data-theme", this.plugin.settings.stylePreset);

    const bannerEl = container.createDiv({ cls: "hubstack-banner" });
    if (this.plugin.settings.bannerHeight) {
      bannerEl.style.minHeight = `${this.plugin.settings.bannerHeight}px`;
    }
    renderBanner(bannerEl, this.plugin.settings, this.app, () => this.plugin.saveSettings());

    const tabBar = container.createDiv({ cls: "hubstack-tab-bar-wrap" });
    renderTabBar(tabBar, this.plugin.settings.activeTab, (t) => this.setActiveTab(t));

    const tabContent = container.createDiv({ cls: "hubstack-tab-content" });

    if (this.plugin.settings.activeTab === "notes") {
      renderNotesFlow(
        tabContent,
        this.app,
        this.notesSync,
        this.notes,
        this.cleanupFns,
        (render) => render()
      );
      return;
    }

    if (this.plugin.settings.activeTab === "exam") {
      await renderExamTab(tabContent, this.plugin, () => {
        if (this.plugin.settings.activeTab === "exam") void this.render();
      });
      return;
    }

    const body = tabContent.createDiv({ cls: "hubstack-body" });

    const sidebar = body.createDiv({ cls: "hubstack-left-sidebar" });
    renderSidebar(sidebar, this.app, this.plugin, this.cleanupFns);

    const main = body.createDiv({ cls: "hubstack-main" });

    const todoSection = main.createDiv({ cls: "hubstack-section" });
    const todoHeader = todoSection.createDiv({ cls: "hubstack-section-header" });
    todoHeader.createDiv({ cls: "hubstack-section-dot hubstack-section-dot--red" });
    todoHeader.createEl("span", { text: "待办事项", cls: "hubstack-section-title" });
    const todoBody = todoSection.createDiv({ cls: "hubstack-section-body" });
    if (this.kanbanData) {
      await renderTodo(todoBody, this.kanbanData, this.kanbanSync, this.app, this.activityLog, this.cleanupFns);
    }

    const heatmapSection = main.createDiv({ cls: "hubstack-section" });
    const heatmapHeader = heatmapSection.createDiv({ cls: "hubstack-section-header" });
    heatmapHeader.createDiv({ cls: "hubstack-section-dot hubstack-section-dot--yellow" });
    heatmapHeader.createEl("span", { text: "活跃度", cls: "hubstack-section-title" });
    const heatmapBody = heatmapSection.createDiv({ cls: "hubstack-section-body" });
    renderHeatmap(heatmapBody, this.plugin.settings, this.activityLog);

    const bookSection = main.createDiv({ cls: "hubstack-section" });
    const bookHeader = bookSection.createDiv({ cls: "hubstack-section-header" });
    bookHeader.createDiv({ cls: "hubstack-section-dot hubstack-section-dot--blue" });
    bookHeader.createEl("span", { text: "书架", cls: "hubstack-section-title" });
    const bookBody = bookSection.createDiv({ cls: "hubstack-section-body" });
    renderBookshelf(bookBody, this.app, this.plugin);
  }
}
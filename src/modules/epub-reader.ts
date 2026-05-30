import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import NexusPlugin from "../main";
import ePub from "epubjs";

export const NEXUS_EPUB_VIEW_TYPE = "nexus-epub-reader";

// Module-level state to pass data to the view factory
let _pendingFile: TFile | null = null;
let _pendingPlugin: NexusPlugin | null = null;

export function openEpubInNewLeaf(file: TFile, plugin: NexusPlugin) {
  _pendingFile = file;
  _pendingPlugin = plugin;
  const leaf = plugin.app.workspace.getLeaf(true);
  leaf.setViewState({ type: NEXUS_EPUB_VIEW_TYPE, active: true });
  _pendingFile = null;
  _pendingPlugin = null;
}

export class EpubReaderView extends ItemView {
  file: TFile | null;
  plugin: NexusPlugin;
  private book: any = null;
  private rendition: any = null;
  private readingStartTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.file = _pendingFile;
    this.plugin = _pendingPlugin!;
  }

  getViewType() { return NEXUS_EPUB_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename || "EPUB"; }
  getIcon() { return "book-open"; }

  async onOpen() {
    if (!this.file || !this.plugin) return;
    await this.renderReader();
  }

  async onClose() {
    this.stopReading();
    if (this.book) {
      this.book.destroy();
      this.book = null;
    }
  }

  private async renderReader() {
    const container = this.contentEl;
    container.empty();
    container.addClass("nexus-epub-standalone");

    // Toolbar
    const toolbar = container.createDiv({ cls: "nexus-epub-toolbar" });
    toolbar.createEl("span", {
      text: this.file!.basename,
      cls: "nexus-epub-title",
    });

    // Font size
    const fontGroup = toolbar.createDiv({ cls: "nexus-epub-font-group" });
    let fontSize = 100;
    fontGroup.createEl("label", { text: "字号" });
    const fontSlider = fontGroup.createEl("input", {
      type: "range",
      attr: { min: "80", max: "160", value: "100" },
    }) as HTMLInputElement;
    const fontLabel = fontGroup.createEl("span", { text: "100%" });

    // Stats bar
    const statsBar = container.createDiv({ cls: "nexus-epub-stats" });
    const sessionLabel = statsBar.createEl("span", { text: "本次: 0s" });
    const totalMs = this.plugin.settings.readingStats[this.file!.path]?.totalDurationMs || 0;
    const totalLabel = statsBar.createEl("span", { text: `累计: ${formatTime(totalMs)}` });
    const statusLabel = statsBar.createEl("span", { text: "状态: 未开始" });

    // Content area - needs explicit height for epubjs
    const readerArea = container.createDiv({ cls: "nexus-epub-content-area" });
    readerArea.style.flex = "1";
    readerArea.style.minHeight = "0";
    readerArea.style.position = "relative";

    // Navigation arrows
    const navPrev = container.createDiv({ cls: "nexus-epub-nav nexus-epub-nav-prev" });
    navPrev.innerHTML = "‹";
    const navNext = container.createDiv({ cls: "nexus-epub-nav nexus-epub-nav-next" });
    navNext.innerHTML = "›";

    // Load epub
    try {
      const buffer = await this.app.vault.readBinary(this.file!);
      this.book = ePub(buffer);

      this.rendition = this.book.renderTo(readerArea, {
        width: "100%",
        height: "100%",
      });

      this.rendition.display();

      // Theme
      const isDark = document.body.classList.contains("theme-dark");
      this.rendition.themes.override("color", isDark ? "#e2e8f0" : "#1e293b");
      this.rendition.themes.override("background", isDark ? "#1e293b" : "#ffffff");

      // Font size slider
      fontSlider.addEventListener("input", () => {
        fontSize = parseInt(fontSlider.value);
        fontLabel.textContent = `${fontSize}%`;
        this.rendition.themes.fontSize(`${fontSize}%`);
      });

      // Keyboard navigation
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft") this.rendition.prev();
        if (e.key === "ArrowRight") this.rendition.next();
      };
      document.addEventListener("keyup", handleKey);
      this.register(() => document.removeEventListener("keyup", handleKey));

      // Arrow button navigation
      navPrev.addEventListener("click", () => this.rendition.prev());
      navNext.addEventListener("click", () => this.rendition.next());

      // Start reading
      this.readingStartTime = Date.now();
      statusLabel.textContent = "状态: 阅读中";
      this.timerInterval = setInterval(() => {
        const elapsed = Date.now() - this.readingStartTime;
        sessionLabel.textContent = `本次: ${formatTime(elapsed)}`;
      }, 1000);

    } catch (e: any) {
      container.createDiv({ text: `加载失败: ${e.message}` });
    }
  }

  private stopReading() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.readingStartTime <= 0 || !this.file) return;
    const durationMs = Date.now() - this.readingStartTime;
    if (durationMs < 5000) return;

    const stats = this.plugin.settings.readingStats;
    const sessions = this.plugin.settings.readingSessions;
    const key = this.file.path;

    if (!stats[key]) {
      stats[key] = {
        filePath: key,
        title: this.file.basename,
        totalDurationMs: 0,
        sessionCount: 0,
        lastReadAt: "",
      };
    }
    stats[key].totalDurationMs += durationMs;
    stats[key].sessionCount += 1;
    stats[key].lastReadAt = new Date().toISOString();

    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (!sessions[dateKey]) sessions[dateKey] = [];
    sessions[dateKey].push({
      filePath: key,
      title: this.file.basename,
      startAt: new Date(this.readingStartTime).toISOString(),
      endAt: new Date().toISOString(),
      durationMs,
    });

    this.plugin.saveSettings();
    this.readingStartTime = 0;
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

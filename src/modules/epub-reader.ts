import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import HubstackPlugin from "../main";
import ePub from "epubjs";
import { formatDuration } from "../utils";
import { getEpubFilePathFromState, getEpubReaderErrorMessage, shouldDeferEpubOpenError } from "../epub-reader-state";

export const HUBSTACK_EPUB_VIEW_TYPE = "hubstack-epub-reader";

// Single plugin reference used for stats persistence after state-driven file restore
let _plugin: HubstackPlugin | null = null;

export function openEpubInNewLeaf(file: TFile, plugin: HubstackPlugin) {
  _plugin = plugin;
  const leaf = plugin.app.workspace.getLeaf(true);
  leaf.setViewState({
    type: HUBSTACK_EPUB_VIEW_TYPE,
    active: true,
    state: { filePath: file.path },
  });
}

export class EpubReaderView extends ItemView {
  file: TFile | null = null;
  plugin: HubstackPlugin | null = null;
  private filePath: string | null = null;
  private stateReady = false;
  private book: any = null;
  private rendition: any = null;
  private readingStartTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private lastCfi: string | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  async setState(state: any, result: any): Promise<void> {
    this.filePath = getEpubFilePathFromState(state);
    this.file = this.filePath ? this.app.vault.getFileByPath(this.filePath) || null : null;
    this.plugin = _plugin;
    this.stateReady = true;
    await super.setState(state, result);
    // setState is the authoritative state — always render, even if onOpen already ran
    if (!this.file) {
      this.renderError(getEpubReaderErrorMessage(this.filePath));
      return;
    }
    if (!this.plugin) {
      this.renderError("EPUB 阅读器未完成初始化");
      return;
    }
    await this.renderReader();
  }

  getViewType() { return HUBSTACK_EPUB_VIEW_TYPE; }
  getDisplayText() { return this.file?.basename || "EPUB"; }
  getIcon() { return "book-open"; }

  async onOpen() {
    // setState is the authoritative render trigger.
    // If it already ran, it already rendered. If not, wait for it.
    // Fallback: if setState is never called (edge case), try rendering after 2s.
    if (this.stateReady) return; // setState already rendered
    setTimeout(() => {
      if (!this.stateReady && this.contentEl.children.length === 0) {
        if (this.file && this.plugin) {
          this.renderReader();
        }
      }
    }, 2000);
  }

  async onClose() {
    this.stopReading();
    if (this.book) {
      this.book.destroy();
      this.book = null;
    }
  }

  private renderError(message: string) {
    const container = this.contentEl;
    container.empty();
    container.addClass("hubstack-epub-standalone");
    container.createDiv({ cls: "hubstack-epub-error", text: message });
  }

  private async renderReader() {
    const container = this.contentEl;
    container.empty();
    container.addClass("hubstack-epub-standalone");

    // Toolbar
    const toolbar = container.createDiv({ cls: "hubstack-epub-toolbar" });
    toolbar.createEl("span", {
      text: this.file!.basename,
      cls: "hubstack-epub-title",
    });

    // Font size
    const fontGroup = toolbar.createDiv({ cls: "hubstack-epub-font-group" });
    let fontSize = 100;
    fontGroup.createEl("label", { text: "字号" });
    const fontSlider = fontGroup.createEl("input", {
      type: "range",
      attr: { min: "80", max: "160", value: "100" },
    }) as HTMLInputElement;
    const fontLabel = fontGroup.createEl("span", { text: "100%" });

    // Stats bar
    const statsBar = container.createDiv({ cls: "hubstack-epub-stats" });
    const sessionLabel = statsBar.createEl("span", { text: "本次: 0s" });
    const totalMs = this.plugin?.settings.readingStats[this.file!.path]?.totalDurationMs || 0;
    const totalLabel = statsBar.createEl("span", { text: `累计: ${formatDuration(totalMs)}` });
    const statusLabel = statsBar.createEl("span", { text: "状态: 未开始" });

    // Content area - needs explicit height for epubjs
    const readerArea = container.createDiv({ cls: "hubstack-epub-content-area" });
    readerArea.style.flex = "1";
    readerArea.style.minHeight = "0";
    readerArea.style.position = "relative";

    // Navigation arrows
    const navPrev = container.createDiv({ cls: "hubstack-epub-nav hubstack-epub-nav-prev" });
    navPrev.innerHTML = "‹";
    const navNext = container.createDiv({ cls: "hubstack-epub-nav hubstack-epub-nav-next" });
    navNext.innerHTML = "›";

    // Load epub
    try {
      const buffer = await this.app.vault.readBinary(this.file!);
      this.book = ePub(buffer);

      // Wait for epub metadata to resolve
      await this.book.ready;

      // Force layout: measure reader area height before rendering epub
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const rect = readerArea.getBoundingClientRect();
      readerArea.style.height = `${rect.height}px`;

      this.rendition = this.book.renderTo(readerArea, {
        width: String(Math.floor(rect.width)) + "px",
        height: String(Math.floor(rect.height)) + "px",
      });

      // Track current position for save on close
      this.rendition.on("relocated", (location: any) => {
        if (location?.start?.cfi) {
          this.lastCfi = location.start.cfi;
          console.log("[EpubReader] Saved CFI:", this.lastCfi);
        }
      });
      
      // Also try to get current location via epubjs API
      const getCurrentLocationCfi = async (): Promise<string | null> => {
        try {
          if (typeof this.rendition.getCurrentLocation === 'function') {
            const loc = await this.rendition.getCurrentLocation();
            if (loc?.end?.cfi) return loc.end.cfi;
            if (loc?.start?.cfi) return loc.start.cfi;
          }
        } catch (e) {
          console.warn("[EpubReader] getCurrentLocation failed:", e);
        }
        return this.lastCfi;
      };

      // Restore reading position from last session, or start from beginning
      const savedCfi = this.plugin!.settings.readingStats[this.file!.path]?.lastLocationCfi;
      console.log("[EpubReader] Restoring saved CFI:", savedCfi);
      if (savedCfi && typeof this.rendition.display === "function") {
        let restored = false;
        try {
          // Try direct CFI restoration first (works in some epubjs versions)
          await this.rendition.display(savedCfi);
          restored = true;
          console.log("[EpubReader] Direct CFI restore succeeded");
        } catch (e) {
          console.warn("[EpubReader] Direct CFI display failed, trying chapter-based restore:", savedCfi, e);
        }

        if (!restored) {
          // Extract spine index and chapter from CFI: epubcfi({spinePath}/{frag}...)
          const cfMatch = savedCfi.match(/epubcfi\((\/[^/]+)\/([^/]+)\//);
          if (cfMatch) {
            const spinePath = cfMatch[1]; // e.g. /6
            const fragPart = cfMatch[2];  // e.g. 4
            const items = this.book.spine?.spineItems || [];
            // Find the chapter by spine index (first number segment)
            const idxMatch = spinePath.match(/^\/(\d+)/);
            if (idxMatch) {
              const idx = parseInt(idxMatch[1]);
              const target = items[idx];
              if (target) {
                await this.rendition.display(target.href);
                setTimeout(() => {
                  try {
                    const allFrames = document.querySelectorAll('iframe');
                    for (const iframe of Array.from(allFrames)) {
                      const bodyEl = iframe.contentDocument?.body;
                      if (!bodyEl) continue;
                      // Try various selector forms based on fragPart
                      const selectors = [
                        `#${fragPart}`,
                        `[name="${fragPart}"]`,
                        `.fragment-${fragPart}`,
                        `.chapter-ref-${fragPart}`,
                        `a[name="${fragPart}"]`,
                        `section#${fragPart}`,
                        `div#${fragPart}`,
                      ];
                      for (const sel of selectors) {
                        const el = bodyEl.querySelector(sel);
                        if (el && el.scrollIntoView) {
                          el.scrollIntoView({ block: 'start' });
                          break;
                        }
                      }
                    }
                  } catch (e) {
                    console.warn("[EpubReader] Scroll to position failed:", e);
                  }
                }, 800);
              }
            }
          }
        }

        if (!restored) {
          await this.rendition.display();
        }
      } else {
        await this.rendition.display();
      }

      // Save position when user stays on current page for at least 10 seconds
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const performSave = async () => {
        if (!this.file || !this.plugin) return;
        // Try to get most accurate location via epubjs API
        let cfiToSave = this.lastCfi;
        try {
          if (typeof this.rendition.getCurrentLocation === 'function') {
            const loc = await this.rendition.getCurrentLocation();
            if (loc?.end?.cfi) cfiToSave = loc.end.cfi;
            else if (loc?.start?.cfi) cfiToSave = loc.start.cfi;
          }
        } catch (e) {
          console.warn("[EpubReader] Location fetch failed, using cached CFI:", e);
        }
        if (!cfiToSave) return;
        
        const stats = this.plugin.settings.readingStats;
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
        stats[key].lastLocationCfi = cfiToSave;
        stats[key].lastReadAt = new Date().toISOString();
        console.log("[EpubReader] Auto-saved CFI:", cfiToSave);
        this.plugin.saveSettings();
      };
      
      const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => performSave(), 10000);
      };

      // Schedule a save tick every time the page changes
      const onRelocated = () => scheduleSave();
      this.rendition.on("relocated", onRelocated);

      // Initial schedule after display finishes
      setTimeout(scheduleSave, 2000);

      this.register(() => { if (saveTimer) clearTimeout(saveTimer); });

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

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft") this.rendition.prev();
        if (e.key === "ArrowRight") this.rendition.next();
      };
      document.addEventListener("keyup", handleKey);
      this.register(() => document.removeEventListener("keyup", handleKey));

      // Arrow button navigation
      navPrev.addEventListener("click", () => this.rendition.prev());
      navNext.addEventListener("click", () => this.rendition.next());

      // Touch swipe support for iPad/tablet
      let touchStartX = 0;
      let touchStartY = 0;
      const SWIPE_THRESHOLD = 50; // minimum pixels to count as swipe
      
      const handleTouchStart = (e: TouchEvent) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      };
      
      const handleTouchEnd = (e: TouchEvent) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        // Only trigger if horizontal swipe is dominant
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
          if (deltaX > 0) {
            // Swipe right -> previous page
            this.rendition.prev();
          } else {
            // Swipe left -> next page
            this.rendition.next();
          }
        }
      };
      
      readerArea.addEventListener("touchstart", handleTouchStart, { passive: true });
      readerArea.addEventListener("touchend", handleTouchEnd, { passive: true });
      this.register(() => {
        readerArea.removeEventListener("touchstart", handleTouchStart);
        readerArea.removeEventListener("touchend", handleTouchEnd);
      });

      // Auto-reflow on orientation change (iPad/tablet)
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const handleResize = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (this.rendition && this.book) {
            const newRect = readerArea.getBoundingClientRect();
            if (newRect.width > 0 && newRect.height > 0) {
              readerArea.style.height = `${newRect.height}px`;
              this.rendition.resize(Math.floor(newRect.width), Math.floor(newRect.height));
            }
          }
        }, 300); // debounce 300ms
      };
      
      window.addEventListener("orientationchange", handleResize);
      window.addEventListener("resize", handleResize);
      this.register(() => {
        window.removeEventListener("orientationchange", handleResize);
        window.removeEventListener("resize", handleResize);
        if (resizeTimer) clearTimeout(resizeTimer);
      });

      // Start reading
      this.readingStartTime = Date.now();
      statusLabel.textContent = "状态: 阅读中";
      this.timerInterval = setInterval(() => {
        const elapsed = Date.now() - this.readingStartTime;
        sessionLabel.textContent = `本次: ${formatDuration(elapsed)}`;
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
    if (!this.file || !this.plugin) return;

    const stats = this.plugin.settings.readingStats;
    const key = this.file.path;

    // Always save CFI position if available (even if reading time was short)
    if (this.lastCfi) {
      if (!stats[key]) {
        stats[key] = {
          filePath: key,
          title: this.file.basename,
          totalDurationMs: 0,
          sessionCount: 0,
          lastReadAt: "",
        };
      }
      stats[key].lastLocationCfi = this.lastCfi;
      this.plugin.saveSettings();
    }

    // Only record reading session if duration >= 1s
    if (this.readingStartTime <= 0) return;
    const durationMs = Date.now() - this.readingStartTime;
    if (durationMs < 1000) return;

    const sessions = this.plugin.settings.readingSessions;
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

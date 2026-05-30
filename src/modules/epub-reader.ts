import { App, TFile, ItemView, WorkspaceLeaf } from "obsidian";
import NexusPlugin from "../main";

export const NEXUS_EPUB_VIEW_TYPE = "nexus-epub-view";

export class EpubReaderView extends ItemView {
  private file: TFile;
  private plugin: NexusPlugin;
  private readingStartTime: number = 0;
  private container: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, file: TFile, plugin: NexusPlugin) {
    super(leaf);
    this.file = file;
    this.plugin = plugin;
  }

  getViewType(): string {
    return NEXUS_EPUB_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename || "EPUB Reader";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen() {
    this.readingStartTime = Date.now();
    await this.renderEpub();
  }

  async onClose() {
    this.recordReadingSession();
  }

  private async recordReadingSession() {
    if (this.readingStartTime <= 0) return;
    const durationMs = Date.now() - this.readingStartTime;
    if (durationMs < 5000) return; // Ignore < 5s sessions

    const key = this.file.path;
    const stats = this.plugin.settings.readingStats;
    const sessions = this.plugin.settings.readingSessions;

    // Update stats
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

    // Record session
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

    await this.plugin.saveSettings();
  }

  private async renderEpub() {
    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass("nexus-epub-reader");

    try {
      const buffer = await this.app.vault.readBinary(this.file);
      const JSZip: any = (await import("jszip") as any).default;
      const zip = await JSZip.loadAsync(buffer);

      // Parse container.xml to find OPF
      const containerXml = await zip.file("META-INF/container.xml")?.async("text");
      if (!containerXml) {
        contentEl.createDiv({ text: "无效的 EPUB：缺少 container.xml" });
        return;
      }

      const opfPath = this.parseContainerXml(containerXml);
      if (!opfPath) {
        contentEl.createDiv({ text: "无效的 EPUB：找不到 OPF 文件" });
        return;
      }

      const opfContent = await zip.file(opfPath)?.async("text");
      if (!opfContent) {
        contentEl.createDiv({ text: "无效的 EPUB：无法读取 OPF" });
        return;
      }

      const opf = this.parseOpf(opfContent, opfPath);

      // Render sidebar TOC + content area
      const reader = contentEl.createDiv({ cls: "nexus-epub-container" });

      // TOC sidebar
      const toc = reader.createDiv({ cls: "nexus-epub-toc" });
      toc.createEl("h4", { text: "目录" });
      const tocList = toc.createEl("ul", { cls: "nexus-epub-toc-list" });

      // Content area
      const content = reader.createDiv({ cls: "nexus-epub-content" });

      // Load spine items
      const spineItems: { href: string; title: string }[] = [];
      for (const itemRef of opf.spine) {
        const manifestItem = opf.manifest[itemRef];
        if (manifestItem) {
          spineItems.push({
            href: manifestItem.href,
            title: manifestItem.title || manifestItem.href,
          });
        }
      }

      // Render TOC
      for (let i = 0; i < spineItems.length; i++) {
        const item = spineItems[i];
        const li = tocList.createEl("li");
        const link = li.createEl("a", {
          text: item.title,
          cls: "nexus-epub-toc-link",
        });
        link.addEventListener("click", () => {
          this.renderChapter(content, zip, opf.basePath, item.href);
        });
      }

      // Render first chapter
      if (spineItems.length > 0) {
        await this.renderChapter(content, zip, opf.basePath, spineItems[0].href);
      }
    } catch (e) {
      contentEl.createDiv({ text: `Error loading EPUB: ${e}` });
    }
  }

  private async renderChapter(
    container: HTMLElement,
    zip: any,
    basePath: string,
    href: string
  ) {
    container.empty();
    const fullPath = basePath ? `${basePath}/${href}` : href;
    const html = await zip.file(fullPath)?.async("text");
    if (!html) {
      container.createDiv({ text: `Chapter not found: ${href}` });
      return;
    }

    // Create iframe for isolated rendering
    const iframe = container.createEl("iframe", {
      cls: "nexus-epub-iframe",
    });
    iframe.style.width = "100%";
    iframe.style.border = "none";
    iframe.style.minHeight = "500px";

    // Write HTML into iframe
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      // Inject base styles
      const style = doc.createElement("style");
      style.textContent = `
        body {
          font-family: var(--font-text), serif;
          line-height: 1.8;
          padding: 20px 40px;
          max-width: 700px;
          margin: 0 auto;
          color: var(--text-normal);
        }
        img { max-width: 100%; height: auto; }
      `;
      doc.head.appendChild(style);
    }
  }

  private parseContainerXml(xml: string): string | null {
    const match = xml.match(/full-path="([^"]+)"/);
    return match ? match[1] : null;
  }

  private parseOpf(xml: string, opfPath: string): {
    basePath: string;
    manifest: Record<string, { href: string; title?: string; mediaType: string }>;
    spine: string[];
  } {
    const basePath = opfPath.includes("/")
      ? opfPath.substring(0, opfPath.lastIndexOf("/"))
      : "";

    const manifest: Record<string, { href: string; title?: string; mediaType: string }> = {};
    const spine: string[] = [];

    // Parse manifest items
    const manifestRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/g;
    let match;
    while ((match = manifestRegex.exec(xml)) !== null) {
      manifest[match[1]] = {
        href: match[2],
        mediaType: match[3],
        title: match[2].replace(/\.\w+$/, "").replace(/[-_]/g, " "),
      };
    }

    // Parse spine
    const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*\/?>/g;
    while ((match = spineRegex.exec(xml)) !== null) {
      spine.push(match[1]);
    }

    return { basePath, manifest, spine };
  }
}

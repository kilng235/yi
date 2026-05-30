import { App, TFile } from "obsidian";
import NexusPlugin from "../main";
import { openEpubInNewLeaf } from "./epub-reader";

interface BookEntry {
  file: TFile;
  coverUrl: string | null;
  status: "unread" | "reading" | "done";
}

export function renderBookshelf(
  el: HTMLElement,
  app: App,
  plugin: NexusPlugin,
  _cleanupFns: Array<() => void>
) {
  el.empty();
  el.addClass("nexus-bookshelf");

  const header = el.createDiv({ cls: "nexus-bookshelf-header" });
  header.createEl("h3", { text: "书架" });

  const epubFiles = app.vault
    .getFiles()
    .filter((f) => f.extension === "epub");

  if (epubFiles.length === 0) {
    el.createDiv({
      cls: "nexus-bookshelf-empty",
      text: "未在 vault 中找到 .epub 文件。",
    });
    return;
  }

  const grid = el.createDiv({ cls: "nexus-bookshelf-grid" });

  for (const file of epubFiles) {
    const entry = getBookEntry(file, plugin);
    renderBookCard(grid, entry, app, plugin);
  }
}

function getBookEntry(file: TFile, plugin: NexusPlugin): BookEntry {
  const stats = plugin.settings.readingStats[file.path];
  let status: "unread" | "reading" | "done" = "unread";
  if (stats && stats.totalDurationMs > 0) {
    status = stats.lastReadAt ? "reading" : "unread";
  }
  return { file, coverUrl: null, status };
}

function renderBookCard(
  el: HTMLElement,
  entry: BookEntry,
  app: App,
  plugin: NexusPlugin
) {
  const card = el.createDiv({ cls: "nexus-book-card" });

  // Cover
  const cover = card.createDiv({ cls: "nexus-book-cover" });
  cover.createDiv({ cls: "nexus-book-cover-placeholder", text: "📖" });

  loadCover(entry.file, app).then((url) => {
    if (url) {
      cover.empty();
      const img = cover.createEl("img", { cls: "nexus-book-cover-img" });
      img.src = url;
    }
  }).catch(() => {});

  // Title
  card.createEl("div", {
    text: entry.file.basename,
    cls: "nexus-book-title",
  });

  // Status
  const stats = plugin.settings.readingStats[entry.file.path];
  const statusText = stats
    ? formatReadingTime(stats.totalDurationMs)
    : "未开始阅读";
  card.createEl("div", { text: statusText, cls: "nexus-book-status" });

  // Click → open in new tab
  card.addEventListener("click", () => {
    openEpubInNewLeaf(entry.file, plugin);
  });
}

async function loadCover(file: TFile, app: App): Promise<string | null> {
  try {
    const buffer = await app.vault.readBinary(file);
    const JSZip: any = (await import("jszip") as any).default;
    const zip = await JSZip.loadAsync(buffer);

    const coverPatterns = [
      /^OEBPS\/.*cover.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^OEBPS\/images\/.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^images\/.*cover.*\.(jpg|jpeg|png|gif|webp)$/i,
    ];

    for (const pattern of coverPatterns) {
      for (const [path, zf] of Object.entries(zip.files)) {
        if (pattern.test(path) && !(zf as any).dir) {
          const blob = await (zf as any).async("blob");
          return URL.createObjectURL(blob);
        }
      }
    }
  } catch (e) {
    // Silently fail
  }
  return null;
}

function formatReadingTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return "刚开始";
}

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

  // Cover placeholder
  const cover = card.createDiv({ cls: "nexus-book-cover" });
  cover.createDiv({ cls: "nexus-book-cover-placeholder", text: "📖" });

  // Load cover async with improved extraction
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

    // Strategy 1: Check OPF metadata for cover image reference
    const coverFromOpf = await tryExtractCoverFromOpf(zip);
    if (coverFromOpf) return coverFromOpf;

    // Strategy 2: Look for common cover filenames
    const coverByName = await tryExtractCoverByName(zip);
    if (coverByName) return coverByName;

    // Strategy 3: Look in common image directories
    const coverByDir = await tryExtractCoverByDir(zip);
    if (coverByDir) return coverByDir;
  } catch (e) {
    // Silently fail
  }
  return null;
}

/** Parse OPF to find the cover image declared in metadata */
async function tryExtractCoverFromOpf(zip: any): Promise<string | null> {
  try {
    // Find container.xml to locate OPF
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) return null;
    const containerXml = await containerFile.async("text");
    const opfMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!opfMatch) return null;

    const opfPath = opfMatch[1];
    const opfFile = zip.file(opfPath);
    if (!opfFile) return null;
    const opfContent = await opfFile.async("text");

    // Find cover image id in metadata
    // Pattern 1: <meta name="cover" content="cover-image-id"/>
    const coverMetaMatch = opfContent.match(
      /<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i
    );
    // Pattern 2: <meta content="cover-image-id" name="cover"/>
    const coverMetaMatch2 = opfContent.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i
    );
    const coverId = coverMetaMatch?.[1] || coverMetaMatch2?.[1];

    if (coverId) {
      // Find the manifest item with this id
      const idRegex = new RegExp(
        `<item[^>]+id=["']${escapeRegex(coverId)}["'][^>]+href=["']([^"']+)["']`,
        "i"
      );
      const idMatch2 = opfContent.match(
        new RegExp(
          `<item[^>]+href=["']([^"']+)["'][^>]+id=["']${escapeRegex(coverId)}["']`,
          "i"
        )
      );
      const href = idRegex.exec(opfContent)?.[1] || idMatch2?.[1];

      if (href) {
        const basePath = opfPath.includes("/")
          ? opfPath.substring(0, opfPath.lastIndexOf("/"))
          : "";
        const fullPath = basePath ? `${basePath}/${href}` : href;
        return await extractImageFromZip(zip, fullPath);
      }
    }

    // Pattern 3: Look for item with properties="cover-image"
    const coverPropMatch = opfContent.match(
      /<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]+href=["']([^"']+)["']/i
    );
    if (coverPropMatch) {
      const basePath = opfPath.includes("/")
        ? opfPath.substring(0, opfPath.lastIndexOf("/"))
        : "";
      const fullPath = basePath
        ? `${basePath}/${coverPropMatch[1]}`
        : coverPropMatch[1];
      return await extractImageFromZip(zip, fullPath);
    }
  } catch {
    // Ignore
  }
  return null;
}

/** Look for files named cover.* or *cover* in the zip */
async function tryExtractCoverByName(zip: any): Promise<string | null> {
  const coverPatterns = [
    /^.*\/?cover\.(jpg|jpeg|png|gif|webp)$/i,
    /^.*\/?cover-image\.(jpg|jpeg|png|gif|webp)$/i,
    /^.*\/?cover_img\.(jpg|jpeg|png|gif|webp)$/i,
  ];

  for (const pattern of coverPatterns) {
    for (const [path, zf] of Object.entries(zip.files)) {
      if (pattern.test(path) && !(zf as any).dir) {
        return await extractImageFromZip(zip, path);
      }
    }
  }
  return null;
}

/** Look in common image directories for the first image */
async function tryExtractCoverByDir(zip: any): Promise<string | null> {
  const imageDirs = [
    /^OEBPS\/images?\//i,
    /^OEBPS\/Images\//i,
    /^images?\//i,
    /^Images\//i,
    /^EPUB\/images?\//i,
    /^text\/images?\//i,
  ];

  for (const dirPattern of imageDirs) {
    for (const [path, zf] of Object.entries(zip.files)) {
      if (
        dirPattern.test(path) &&
        !(zf as any).dir &&
        /\.(jpg|jpeg|png|gif|webp)$/i.test(path)
      ) {
        // Prefer files with "cover" in name
        if (/cover/i.test(path)) {
          return await extractImageFromZip(zip, path);
        }
      }
    }
    // If no cover-named file, take the first image in the directory
    for (const [path, zf] of Object.entries(zip.files)) {
      if (
        dirPattern.test(path) &&
        !(zf as any).dir &&
        /\.(jpg|jpeg|png|gif|webp)$/i.test(path)
      ) {
        return await extractImageFromZip(zip, path);
      }
    }
  }
  return null;
}

/** Extract an image from zip and return a blob URL */
async function extractImageFromZip(
  zip: any,
  path: string
): Promise<string | null> {
  try {
    const file = zip.file(path);
    if (!file) return null;
    const blob = await file.async("blob");
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatReadingTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m`;
  return "刚开始";
}

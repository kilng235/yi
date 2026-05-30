import { App, TFile } from "obsidian";
import { NexusSettings } from "../types";

interface BookItem {
  title: string;
  path: string;
  coverUrl?: string;
  progress?: number;
}

export function renderBookshelf(el: HTMLElement, settings: NexusSettings, app: App) {
  el.empty();
  el.addClass("nexus-bookshelf");

  const header = el.createDiv({ cls: "nexus-bookshelf-header" });
  header.createEl("h3", { text: "📚 书架" });

  const books = scanEpubFiles(app);

  if (books.length === 0) {
    el.createDiv({ text: "未找到 epub 文件", cls: "nexus-bookshelf-empty" });
    return;
  }

  const grid = el.createDiv({ cls: "nexus-bookshelf-grid" });
  for (const book of books) {
    const card = grid.createDiv({ cls: "nexus-book-card" });
    if (book.coverUrl) {
      card.createEl("img", { cls: "nexus-book-cover", attr: { src: book.coverUrl } });
    } else {
      card.createDiv({ cls: "nexus-book-cover-placeholder", text: "📕" });
    }
    card.createDiv({ cls: "nexus-book-title", text: book.title });
    card.addEventListener("click", () => {
      const file = app.vault.getAbstractFileByPath(book.path);
      if (file instanceof TFile) {
        app.workspace.openLinkText(book.path, "", false);
      }
    });
  }
}

function scanEpubFiles(app: App): BookItem[] {
  const files = app.vault.getFiles().filter(f => f.extension === "epub");
  return files.map(f => ({
    title: f.basename,
    path: f.path,
  }));
}

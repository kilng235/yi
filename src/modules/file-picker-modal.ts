import { App, Modal, TFile } from "obsidian";

export class FilePickerModal extends Modal {
  private onSelect: (file: TFile) => void;
  private inputEl: HTMLInputElement;
  private resultsEl: HTMLElement;
  private files: TFile[];

  constructor(app: App, onSelect: (file: TFile) => void) {
    super(app);
    this.onSelect = onSelect;
    this.files = app.vault.getMarkdownFiles().filter(f => !f.path.startsWith("."));
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "添加文件到看板" });

    this.inputEl = contentEl.createEl("input", {
      type: "text",
      placeholder: "搜索文件...",
      cls: "nexus-modal-input",
    });
    this.inputEl.style.width = "100%";
    this.inputEl.style.marginTop = "12px";

    this.resultsEl = contentEl.createDiv({ cls: "nexus-file-picker-results" });
    this.resultsEl.style.maxHeight = "300px";
    this.resultsEl.style.overflowY = "auto";
    this.resultsEl.style.marginTop = "8px";

    this.renderResults(this.files.slice(0, 20));

    this.inputEl.addEventListener("input", () => {
      const query = this.inputEl.value.toLowerCase().trim();
      const filtered = query
        ? this.files.filter(f => f.basename.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
        : this.files;
      this.renderResults(filtered.slice(0, 20));
    });

    setTimeout(() => this.inputEl.focus(), 50);
  }

  private renderResults(files: TFile[]) {
    this.resultsEl.empty();
    if (files.length === 0) {
      this.resultsEl.createDiv({ text: "未找到文件", cls: "nexus-file-picker-empty" });
      return;
    }
    for (const file of files) {
      const item = this.resultsEl.createDiv({ cls: "nexus-file-picker-item" });
      item.createSpan({ text: file.basename, cls: "nexus-file-picker-name" });
      item.createSpan({ text: file.path, cls: "nexus-file-picker-path" });
      item.addEventListener("click", () => {
        this.onSelect(file);
        this.close();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

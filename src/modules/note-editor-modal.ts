import { App, Modal } from "obsidian";
import { Note } from "../types";

export class NoteEditorModal extends Modal {
  private mode: "create" | "edit";
  private note: Note | null;
  private onSubmit: (data: { title: string; body: string; tags: string[] }) => void;
  private titleInput: HTMLInputElement;
  private bodyInput: HTMLTextAreaElement;
  private tagsInput: HTMLInputElement;

  constructor(
    app: App,
    mode: "create" | "edit",
    note: Note | null,
    onSubmit: (data: { title: string; body: string; tags: string[] }) => void
  ) {
    super(app);
    this.mode = mode;
    this.note = note;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("nexus-note-editor");

    contentEl.createEl("h3", {
      text: this.mode === "create" ? "新建小记" : "编辑小记",
    });

    this.titleInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "标题（可选）",
      cls: "nexus-note-editor-title",
    });
    this.titleInput.value = this.note?.title || "";

    this.bodyInput = contentEl.createEl("textarea", {
      placeholder: "写点什么...",
      cls: "nexus-note-editor-body",
      attr: { rows: "8" },
    });
    this.bodyInput.value = this.note?.body || "";

    this.tagsInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "标签（逗号分隔，如：灵感, 阅读）",
      cls: "nexus-note-editor-tags",
    });
    this.tagsInput.value = this.note?.tags.join(", ") || "";

    const btnRow = contentEl.createDiv({ cls: "nexus-note-editor-buttons" });
    const cancelBtn = btnRow.createEl("button", { text: "取消" });
    cancelBtn.addEventListener("click", () => this.close());

    const submitBtn = btnRow.createEl("button", {
      text: this.mode === "create" ? "创建" : "保存",
      cls: "mod-cta",
    });
    submitBtn.addEventListener("click", () => this.submit());

    this.titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.bodyInput.focus(); }
    });
    this.bodyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submit(); }
    });
    this.tagsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.submit(); }
    });

    setTimeout(() => this.titleInput.focus(), 50);
  }

  private submit() {
    const title = this.titleInput.value.trim();
    const body = this.bodyInput.value.trim();
    const tags = this.tagsInput.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!title && !body) {
      this.close();
      return;
    }
    this.onSubmit({ title, body, tags });
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

import { App, Modal } from "obsidian";
import { Note } from "../types";
import { renderTemplate, todayString } from "./note-template";
import { attachImagePasteHandler } from "./paste-handler";

export interface NoteEditorModalOptions {
  pendingId?: string;
}

export class NoteEditorModal extends Modal {
  private mode: "create" | "edit";
  private note: Note | null;
  private onSubmit: (data: { title: string; body: string; tags: string[] }) => void;
  private titleInput: HTMLInputElement;
  private bodyInput: HTMLTextAreaElement;
  private tagsInput: HTMLInputElement;
  private options: NoteEditorModalOptions;
  private pasteHandle: { detach: () => void } | null = null;

  constructor(
    app: App,
    mode: "create" | "edit",
    note: Note | null,
    onSubmit: (data: { title: string; body: string; tags: string[] }) => void,
    options: NoteEditorModalOptions = {}
  ) {
    super(app);
    this.mode = mode;
    this.note = note;
    this.onSubmit = onSubmit;
    this.options = options;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("hubstack-note-editor");

    contentEl.createEl("h3", {
      text: this.mode === "create" ? "新建小记" : "编辑小记",
    });

    this.titleInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "标题（可选）",
      cls: "hubstack-note-editor-title",
    });
    this.titleInput.value = this.note?.title || "";
    if (this.mode === "create") {
      const settings = (this.app as any).plugins?.plugins?.hubstack?.settings;
      if (settings?.noteAutoTitle) {
        const { date } = todayString();
        this.titleInput.value = date;
      }
    }

    this.bodyInput = contentEl.createEl("textarea", {
      placeholder: "写点什么...",
      cls: "hubstack-note-editor-body",
      attr: { rows: "8" },
    });
    this.bodyInput.value = this.note?.body || "";
    if (this.mode === "create") {
      const settings = (this.app as any).plugins?.plugins?.hubstack?.settings;
      if (settings?.noteTemplate) {
        const { date, time } = todayString();
        this.bodyInput.value = renderTemplate(settings.noteTemplate, {
          date,
          time,
          title: this.titleInput.value,
        });
      }
    }

    // Image paste support: use note's existing id in edit mode, or pendingId in create mode
    const pasteNoteId = this.mode === "edit" && this.note
      ? this.note.id
      : (this.options.pendingId || Date.now().toString(36));
    this.pasteHandle = attachImagePasteHandler({
      app: this.app,
      noteId: pasteNoteId,
      textarea: this.bodyInput,
    });

    this.tagsInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "标签（逗号分隔，如：灵感, 阅读）",
      cls: "hubstack-note-editor-tags",
    });
    this.tagsInput.value = this.note?.tags.join(", ") || "";

    const btnRow = contentEl.createDiv({ cls: "hubstack-note-editor-buttons" });
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

    setTimeout(() => {
      if (this.mode === "edit") {
        this.bodyInput.focus();
        const len = this.bodyInput.value.length;
        this.bodyInput.setSelectionRange(len, len);
      } else {
        this.titleInput.focus();
      }
    }, 50);
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
    if (this.pasteHandle) {
      this.pasteHandle.detach();
      this.pasteHandle = null;
    }
    this.contentEl.empty();
  }
}

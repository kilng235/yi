import { App, Modal } from "obsidian";

export class InputModal extends Modal {
  private title: string;
  private placeholder: string;
  private onSubmit: (value: string) => void;
  private inputEl: HTMLInputElement;

  constructor(
    app: App,
    title: string,
    placeholder: string,
    onSubmit: (value: string) => void
  ) {
    super(app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });

    this.inputEl = contentEl.createEl("input", {
      type: "text",
      placeholder: this.placeholder,
      cls: "nexus-modal-input",
    });
    this.inputEl.style.width = "100%";
    this.inputEl.style.marginTop = "12px";

    const btnRow = contentEl.createDiv({ cls: "nexus-modal-buttons" });
    btnRow.style.marginTop = "12px";
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "8px";

    const cancelBtn = btnRow.createEl("button", { text: "取消" });
    cancelBtn.addEventListener("click", () => this.close());

    const confirmBtn = btnRow.createEl("button", { text: "确定" });
    confirmBtn.addClass("mod-cta");
    confirmBtn.addEventListener("click", () => {
      const value = this.inputEl.value.trim();
      if (value) {
        this.onSubmit(value);
      }
      this.close();
    });

    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const value = this.inputEl.value.trim();
        if (value) {
          this.onSubmit(value);
        }
        this.close();
      }
      if (e.key === "Escape") {
        this.close();
      }
    });

    // Focus input after render
    setTimeout(() => this.inputEl.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

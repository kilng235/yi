import { App, Modal, Notice } from "obsidian";
import { ExamQuestion } from "./exam-parser";
import { ExamStats, appendWrongsToVault } from "./exam-stats";

const LETTERS = ["A", "B", "C", "D"];

export interface ExamQuizContext {
  app: App;
  stats: ExamStats;
  wrongFolder: string;
  onFinish?: () => void;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 极简 Markdown 渲染：==高亮== → <mark>，**加粗** → <strong>，换行 → <br> */
function fmt(s: string): string {
  return esc(s)
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

type Phase = "answering" | "feedback" | "summary";

interface AnswerRecord {
  q: ExamQuestion;
  picked: string[];
}

export class ExamQuizModal extends Modal {
  private idx = 0;
  private phase: Phase = "answering";
  /** 单选：["A"]；多选：["A","B"] */
  private picked: string[] = [];
  private results: AnswerRecord[] = [];
  private wrongsExported = false;

  constructor(
    app: App,
    private questions: ExamQuestion[],
    private deck: string,
    private ctx: ExamQuizContext
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("hubstack-exam-modal");
    for (let i = 0; i < 4; i++) {
      this.scope.register([], String(i + 1), () => this.pickIndex(i));
    }
    this.scope.register([], "Enter", () => {
      if (this.phase === "answering") void this.submit();
      else this.advance();
    });
    this.render();
  }

  onClose(): void {
    this.ctx.onFinish?.();
    this.contentEl.empty();
  }

  private get current(): ExamQuestion {
    return this.questions[this.idx];
  }

  /** 当前题是否多选 */
  private get isMulti(): boolean {
    return this.current.answer.length > 1;
  }

  /** 判分：完全相等才算对（按集合比较，不计顺序） */
  private isAnswerCorrect(picked: string[], answer: string[]): boolean {
    if (picked.length !== answer.length) return false;
    return [...picked].sort().join("") === [...answer].sort().join("");
  }

  private pickIndex(i: number): void {
    if (this.phase !== "answering") return;
    const opt = this.current?.options[i];
    if (!opt) return;
    const key = opt.key;
    if (this.isMulti) {
      // 多选：toggle
      const idx = this.picked.indexOf(key);
      if (idx === -1) this.picked.push(key);
      else this.picked.splice(idx, 1);
    } else {
      // 单选：替换
      if (this.picked.length === 1 && this.picked[0] === key) return;
      this.picked = [key];
    }
    this.render();
  }

  private async submit(): Promise<void> {
    if (this.phase !== "answering" || this.picked.length === 0) return;
    const q = this.current;
    const correct = this.isAnswerCorrect(this.picked, q.answer);
    this.results.push({ q, picked: [...this.picked] });
    await this.ctx.stats.record(this.ctx.app, this.deck, correct, q);
    if (!correct) {
      await this.ctx.stats.addWrong(this.ctx.app, {
        deck: this.deck,
        stem: q.stem.slice(0, 50),
        correct: [...q.answer],
        yourAnswer: [...this.picked],
        ts: new Date().toISOString(),
      });
    }
    this.phase = "feedback";
    this.render();
  }

  private advance(): void {
    if (this.phase !== "feedback") return;
    if (this.idx + 1 >= this.questions.length) {
      this.phase = "summary";
    } else {
      this.idx += 1;
      this.phase = "answering";
      this.picked = [];
    }
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    if (this.phase === "summary") {
      this.renderSummary();
      return;
    }

    const q = this.current;

    const head = contentEl.createDiv("ceq-head");
    head.createSpan({
      text: `第 ${this.idx + 1} / ${this.questions.length} 题`,
      cls: "ceq-progress",
    });
    head.createSpan({
      text: this.isMulti ? "多选题" : "单选题",
      cls: "ceq-type-badge",
    });
    contentEl
      .createDiv("ceq-bar")
      .createDiv("ceq-bar-fill")
      .style.width = `${(this.idx / this.questions.length) * 100}%`;

    const stem = contentEl.createDiv("ceq-stem");
    stem.innerHTML = fmt(q.stem);

    const wrap = contentEl.createDiv("ceq-options");
    q.options.forEach((opt) => {
      const isPicked = this.picked.includes(opt.key);
      const isCorrect = q.answer.includes(opt.key);

      const row = wrap.createDiv("ceq-option");
      if (this.phase === "answering") {
        if (isPicked) row.addClass("is-selected");
      } else {
        if (isCorrect) row.addClass("is-correct");
        else if (isPicked) row.addClass("is-wrong");
        else row.addClass("is-dim");
      }

      const badge = row.createSpan({ text: opt.key, cls: "ceq-badge" });
      if (this.phase === "feedback") {
        if (isCorrect) badge.setText("✓");
        else if (isPicked) badge.setText("✗");
      } else if (this.isMulti) {
        // 多选答题态：勾选框样式
        const box = row.createSpan({ cls: "ceq-checkbox" });
        box.textContent = isPicked ? "☑" : "☐";
      }

      const txt = row.createSpan({ cls: "ceq-option-text" });
      txt.innerHTML = fmt(opt.text);
      row.addEventListener("click", () => this.pickIndex(q.options.indexOf(opt)));
    });

    if (this.phase === "feedback") {
      const correctPicked = this.isAnswerCorrect(this.picked, q.answer);
      const exp = contentEl.createDiv("ceq-explanation");
      exp.createDiv("ceq-explanation-title", (el) => {
        el.innerHTML = `正确答案：<strong>${q.answer.join("")}</strong>　你的答案：<strong>${this.picked.join("") || "（未作答）"}</strong>　${
          correctPicked ? "✅ 回答正确" : "❌ 回答错误"
        }`;
      });
      if (q.explanation) {
        exp.createDiv("ceq-explanation-body", (el) => {
          el.innerHTML = fmt(q.explanation);
        });
      }
    }

    const foot = contentEl.createDiv("ceq-foot");
    foot.createSpan({
      text: this.isMulti
        ? "快捷键：1-4 切换 · Enter 提交"
        : "快捷键：1-4 选择 · Enter 提交",
      cls: "ceq-hint",
    });
    if (this.phase === "answering") {
      const btn = foot.createEl("button", { text: "提交答案", cls: "mod-cta" });
      btn.disabled = this.picked.length === 0;
      btn.addEventListener("click", () => void this.submit());
    } else {
      const last = this.idx + 1 >= this.questions.length;
      const btn = foot.createEl("button", {
        text: last ? "查看成绩" : "下一题",
        cls: "mod-cta",
      });
      btn.addEventListener("click", () => this.advance());
    }
  }

  private renderSummary(): void {
    const { contentEl } = this;
    const total = this.questions.length;
    const correctCount = this.results.filter((r) => this.isAnswerCorrect(r.picked, r.q.answer)).length;
    const wrongs = this.results.filter((r) => !this.isAnswerCorrect(r.picked, r.q.answer));

    contentEl.createEl("h3", { text: `本轮成绩 · ${this.deck}` });
    const score = contentEl.createDiv("ceq-score");
    score.innerHTML =
      `<span class="ceq-score-num">${correctCount}</span>` +
      `<span class="ceq-score-total"> / ${total}</span>` +
      `<span class="ceq-score-pct">${
        total ? Math.round((correctCount / total) * 100) : 0
      }%</span>`;

    if (wrongs.length) {
      contentEl.createEl("h4", { text: `错题（${wrongs.length}）` });
      const list = contentEl.createDiv("ceq-wrong-list");
      for (const w of wrongs) {
        const item = list.createDiv("ceq-wrong-item");
        item.createDiv({
          text: w.q.stem.length > 60 ? w.q.stem.slice(0, 60) + "…" : w.q.stem,
          cls: "ceq-wrong-stem",
        });
        item.createDiv({
          text: `你的答案 ${w.picked.join("") || "（未作答）"} · 正确答案 ${w.q.answer.join("")}`,
          cls: "ceq-wrong-ans",
        });
      }
    } else {
      contentEl.createDiv({ text: "全部答对，太棒了！🎉", cls: "ceq-allcorrect" });
    }

    const stat = this.ctx.stats.data.decks[this.deck];
    if (stat) {
      contentEl.createDiv({
        text: `${this.deck} 累计：作答 ${stat.answered} · 正确 ${stat.correct} · 错误 ${stat.wrong}`,
        cls: "ceq-deck-meta",
      });
    }

    const foot = contentEl.createDiv("ceq-foot ceq-foot-center");
    if (wrongs.length) {
      const redo = foot.createEl("button", { text: "重做错题" });
      redo.addEventListener("click", () => {
        this.questions = wrongs.map((w) => w.q);
        this.results = [];
        this.idx = 0;
        this.phase = "answering";
        this.picked = [];
        this.wrongsExported = false;
        this.render();
      });

      const exportBtn = foot.createEl("button", {
        text: this.wrongsExported ? "已追加到错题本 ✓" : "追加到错题本",
      });
      exportBtn.disabled = this.wrongsExported;
      exportBtn.addEventListener("click", () => {
        void appendWrongsToVault(
          this.ctx.app,
          this.ctx.wrongFolder,
          this.deck,
          wrongs
        ).then(() => {
          this.wrongsExported = true;
          new Notice("错题已写入错题本目录");
          this.render();
        });
      });
    }
    const close = foot.createEl("button", { text: "关闭" });
    close.addEventListener("click", () => this.close());
  }
}

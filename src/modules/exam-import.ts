import { App, Modal, Notice, normalizePath } from "obsidian";
import { mineruParsePdf } from "./exam-mineru";
import { aiStructureQuestions, AiQuestion } from "./exam-ai";

export interface ExamImportContext {
    mineruToken: string;
    aiApiKey: string;
    aiModel: string;
    bankFolder: string; // 题库根目录，如 hubstack/题库
    onDone?: () => void;
}

type Phase = "pick" | "mining" | "ai" | "preview" | "saved";

interface PreparedQuestion {
    stem: string;
    options: Record<string, string>;
    answer: string;
    topic?: string;
    explanation?: string;
    origin: "single" | "judge";
}

export class ExamImportModal extends Modal {
    private phase: Phase = "pick";
    private subject = "";
    private mdContent = "";
    private questions: AiQuestion[] = [];
    private multiCount = 0;
    private statusEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;

    constructor(app: App, private ctx: ExamImportContext) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass("hubstack-exam-modal");
        this.contentEl.createEl("h3", { text: "AI 导题 · PDF → MinerU → 题库" });
        this.bodyEl = this.contentEl.createDiv("ceq-import-body");
        this.renderPick();
    }

    onClose(): void {
        this.ctx.onDone?.();
        this.contentEl.empty();
    }

    private setStatus(text: string): void {
        if (this.statusEl) this.statusEl.setText(text);
    }

    /* ---------- 阶段 1：选择文件 ---------- */

    private renderPick(): void {
        const body = this.bodyEl!;
        body.empty();
        this.phase = "pick";

        body.createDiv({ text: "选择试卷 PDF，插件将自动：上传 MinerU 解析 → AI 拆题 → 预览确认 → 写入题库。", cls: "ceq-hint" });

        const subjectRow = body.createDiv("ceq-import-row");
        subjectRow.createSpan({ text: "学科：" });
        const input = subjectRow.createEl("input", {
            attr: { type: "text", placeholder: "自动从文件名识别，可修改" },
        });
        input.addClass("ceq-import-subject");
        this.subjectInput = input;

        const fileRow = body.createDiv("ceq-import-row");
        const fileInput = fileRow.createEl("input", { attr: { type: "file", accept: "application/pdf" } });
        fileInput.addClass("ceq-import-file");
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const m = file.name.match(/（(.+?)）/) ?? file.name.match(/\((.+?)\)/);
            if (!this.subjectInput.value && m) this.subjectInput.value = m[1];
            void this.handleFile(file);
        });

        this.statusEl = body.createDiv("ceq-import-status");

        const back = body.createDiv("ceq-foot");
        back.createEl("button", { text: "关闭" }).addEventListener("click", () => this.close());
    }

    private subjectInput: HTMLInputElement | null = null;

    private async handleFile(file: File): Promise<void> {
        try {
            if (!this.ctx.mineruToken) {
                throw new Error("未配置 MinerU Token（设置 → Hubstack → 备考刷题）");
            }
            // 阶段 2：MinerU 解析
            this.phase = "mining";
            this.bodyEl!.empty();
            this.bodyEl!.createEl("h4", { text: `解析：${file.name}` });
            this.statusEl = this.bodyEl!.createDiv("ceq-import-status");
            this.subject = this.subjectInput?.value?.trim() || "综合";

            const buf = await file.arrayBuffer();
            this.mdContent = await mineruParsePdf(buf, file.name, this.ctx.mineruToken, (s) =>
                this.setStatus(s)
            );

            // 阶段 3：AI 拆题
            this.phase = "ai";
            this.setStatus("MinerU 解析完成，AI 拆题中（长卷分段调用，约需数十秒）...");
            this.questions = await aiStructureQuestions(
                this.mdContent,
                this.ctx.aiApiKey,
                this.ctx.aiModel,
                (done, total) => this.setStatus(`AI 拆题中（第 ${done}/${total} 段）...`)
            );
            if (this.questions.length === 0) {
                throw new Error("AI 未识别出任何题目，请检查 PDF 内容");
            }
            this.renderPreview();
        } catch (e) {
            new Notice(`导入失败：${(e as Error).message}`);
            this.setStatus(`❌ ${(e as Error).message}`);
        }
    }

    /* ---------- 阶段 4：预览 ---------- */

    private renderPreview(): void {
        const body = this.bodyEl!;
        body.empty();
        this.phase = "preview";

        const prepared: PreparedQuestion[] = [];
        for (const q of this.questions) {
            if (q.type === "multi") continue; // 与流水线口径一致：多选暂不入库
            const isJudge = q.type === "judge";
            prepared.push({
                stem: q.stem,
                options: isJudge ? { A: "正确", B: "错误" } : q.options,
                answer: isJudge ? q.answer.slice(0, 1) : q.answer,
                topic: q.topic,
                explanation: q.explanation,
                origin: isJudge ? "judge" : "single",
            });
        }
        this.multiCount = this.questions.filter((q) => q.type === "multi").length;

        body.createEl("h4", {
            text: `识别 ${this.questions.length} 题 → 入库 ${prepared.length} 题（多选跳过 ${this.multiCount}）`,
        });

        const list = body.createDiv("ceq-import-preview");
        prepared.forEach((q, i) => {
            const item = list.createDiv("ceq-option");
            const badge = item.createSpan({ text: String(i + 1), cls: "ceq-badge" });
            badge.addClass(q.origin === "judge" ? "is-judge" : "is-single");
            const txt = item.createSpan({ cls: "ceq-option-text" });
            txt.innerHTML =
                `${this.esc(q.stem).slice(0, 60)}${q.stem.length > 60 ? "…" : ""}` +
                `　<strong>${q.answer}</strong>` +
                (q.topic ? `　<span class="ceq-import-topic">${this.esc(q.topic)}</span>` : "");
        });

        const foot = body.createDiv("ceq-foot");
        foot.createSpan({ text: `学科：${this.subject}`, cls: "ceq-hint" });
        const redo = foot.createEl("button", { text: "重新拆题" });
        redo.addEventListener("click", () => {
            void this.aiAgain();
        });
        const save = foot.createEl("button", { text: "写入题库", cls: "mod-cta" });
        save.addEventListener("click", () => void this.save(prepared));
    }

    private async aiAgain(): Promise<void> {
        this.phase = "ai";
        this.bodyEl!.empty();
        this.statusEl = this.bodyEl!.createDiv("ceq-import-status");
        this.setStatus("AI 拆题中...");
        try {
            this.questions = await aiStructureQuestions(
                this.mdContent,
                this.ctx.aiApiKey,
                this.ctx.aiModel,
                (done, total) => this.setStatus(`AI 拆题中（第 ${done}/${total} 段）...`)
            );
            this.renderPreview();
        } catch (e) {
            new Notice(`AI 拆题失败：${(e as Error).message}`);
            this.setStatus(`❌ ${(e as Error).message}`);
        }
    }

    /* ---------- 阶段 5：写库 ---------- */

    private esc(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    private async save(prepared: PreparedQuestion[]): Promise<void> {
        try {
            const app = this.app;
            const today = new Date();
            const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
                today.getDate()
            ).padStart(2, "0")}`;
            const dir = normalizePath(`${this.ctx.bankFolder}/${this.subject}`);
            if (!app.vault.getAbstractFileByPath(dir)) {
                await app.vault.createFolder(dir);
            }
            const base = this.subjectInput?.value?.trim() || "AI导入";
            let path = normalizePath(`${dir}/${base}·AI题库.md`);
            let n = 2;
            while (app.vault.getAbstractFileByPath(path)) {
                path = normalizePath(`${dir}/${base}·AI题库_${n++}.md`);
            }

            const lines: string[] = [
                "---",
                `source: ${base}.pdf`,
                `date: ${dateStr}`,
                `subject: ${this.subject}`,
                `deck: ${this.subject}`,
                `tags: [flashcards, ${this.subject}, 闪点, quiz, AI]`,
                "---",
                "",
                `# ${base} · AI 题库`,
                "",
            ];

            prepared.forEach((q, i) => {
                if (i > 0) {
                    lines.push("---", "");
                }
                lines.push(q.stem, "");
                for (const k of Object.keys(q.options)) {
                    lines.push(`- ${k}. ${q.options[k]}`);
                }
                lines.push("", `**正确答案**: ${q.answer}`, "");
                if (q.topic) lines.push(`**考点**: ${q.topic}`, "");
                if (q.explanation) {
                    lines.push(`> ${q.explanation.replace(/\n/g, "\n> ")}`, "");
                }
            });

            await app.vault.create(path, lines.join("\n"));
            this.phase = "saved";
            this.bodyEl!.empty();
            this.bodyEl!.createDiv({
                text: `✅ 已写入 ${prepared.length} 题 → ${path}`,
                cls: "ceq-allcorrect",
            });
            const foot = this.bodyEl!.createDiv("ceq-foot ceq-foot-center");
            foot.createEl("button", { text: "继续导入下一份" }).addEventListener("click", () => {
                this.subjectInput = null;
                this.renderPick();
            });
            foot.createEl("button", { text: "关闭" }).addEventListener("click", () => this.close());
            new Notice("题库写入完成，备考页签刷新后即可看到");
        } catch (e) {
            new Notice(`写入失败：${(e as Error).message}`);
        }
    }
}

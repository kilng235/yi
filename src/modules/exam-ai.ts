import { requestUrl } from "obsidian";

export interface AiQuestion {
    type: "single" | "multi" | "judge";
    qnum?: number;
    stem: string;
    options: Record<string, string>;
    answer: string;
    topic?: string;
    explanation?: string;
}

const SYSTEM_PROMPT = `你是事业编考试题库结构化助手。用户会给一份从试卷 PDF 解析出的原始文本（可能含 OCR 噪声、水印碎片如"Fb粉華"，题目可能乱序或缺题）。
请把其中每一道选择题整理为结构化 json。规则：
1. 只输出一个 json 对象：{"questions": [...]}，不要输出任何其他文字或 markdown 代码块标记。
2. 每道题的格式：
   {"type":"single|multi|judge","qnum":题号数字,"stem":"题干（保留（　　）空位）","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A 或 ABD","topic":"四到八字考点短语","explanation":"解析原文，没有则空字符串"}
3. 判断题 type 为 "judge"，options 固定为 {"A":"正确","B":"错误"}，answer 为 A（对）或 B（错）。
4. 多选题 type 为 "multi"，answer 如 "ABD"，options 照常列出。
5. 清洗 OCR 水印噪声与乱码（如 Fb粉華、Fb超城 等无关字符），但不得改动题目本身的文字。
6. 题干与选项要完整；文本缺答案或选项不齐全的题直接跳过，不要编造。
7. topic 从题干内容归纳（如"民法典-用益物权"、"刑法-犯罪停止形态"、"宪法-公民基本权利"）。`;

const MAX_CHUNK = 12000;

function chunkText(text: string): string[] {
    if (text.length <= MAX_CHUNK) return [text];
    const lines = text.split("\n");
    const chunks: string[] = [];
    let cur = "";
    for (const line of lines) {
        if (cur.length + line.length > MAX_CHUNK && cur.length > 0) {
            chunks.push(cur);
            cur = "";
        }
        cur += line + "\n";
    }
    if (cur.trim()) chunks.push(cur);
    return chunks;
}

export async function aiStructureQuestions(
    content: string,
    apiKey: string,
    model: string,
    onProgress?: (done: number, total: number) => void
): Promise<AiQuestion[]> {
    const chunks = chunkText(content);
    const all: AiQuestion[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < chunks.length; i++) {
        onProgress?.(i, chunks.length);
        const r = await requestUrl({
            url: "https://api.deepseek.com/chat/completions",
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model || "deepseek-chat",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: `试卷文本（第 ${i + 1}/${chunks.length} 段）：\n${chunks[i]}` },
                ],
                response_format: { type: "json_object" },
                max_tokens: 8192,
                temperature: 0.1,
                stream: false,
            }),
            throw: false,
        });
        if (r.status !== 200) {
            throw new Error(`DeepSeek 请求失败 ${r.status}: ${r.text.slice(0, 200)}`);
        }
        let payload: any = null;
        try {
            payload = JSON.parse(r.json.choices[0].message.content);
        } catch (e) {
            throw new Error(`AI 返回内容无法解析为 JSON: ${(e as Error).message}`);
        }
        const questions: AiQuestion[] = Array.isArray(payload?.questions) ? payload.questions : [];
        for (const q of questions) {
            if (!q || typeof q.stem !== "string" || q.stem.length < 6) continue;
            const key = q.stem.slice(0, 40);
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(q);
        }
    }
    onProgress?.(chunks.length, chunks.length);
    return all;
}

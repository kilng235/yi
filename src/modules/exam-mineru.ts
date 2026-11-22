import { requestUrl } from "obsidian";
import * as https from "https";

const API = "https://mineru.net/api/v4";
const POLL_INTERVAL = 8000;
const POLL_TIMEOUT = 15 * 60 * 1000;

export interface MineruProgress {
    (state: string): void;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** 裸 PUT 上传：不能带任何额外头（签名 URL 校验会因 Content-Type 不匹配而失败），所以走 node https */
function rawPut(url: string, body: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
            { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "PUT" },
            (res) => {
                if (res.statusCode && res.statusCode < 300) {
                    res.resume();
                    resolve();
                } else {
                    let data = "";
                    res.on("data", (c) => (data += c));
                    res.on("end", () =>
                        reject(new Error(`上传失败 ${res.statusCode}: ${data.slice(0, 200)}`))
                    );
                }
            }
        );
        req.on("error", reject);
        req.end(Buffer.from(body));
    });
}

/**
 * 完整解析一个 PDF：申请批量链接 → 上传 → 轮询 → 下载 zip 解出 full.md 文本。
 * 对应官方 /api/v4/file-urls/batch 流程（与 hubstack/脚本/mineru_parse.py 一致）。
 */
export async function mineruParsePdf(
    pdf: ArrayBuffer,
    fileName: string,
    token: string,
    onProgress?: MineruProgress
): Promise<string> {
    // 1. 申请上传链接（同时自动创建解析任务）
    onProgress?.("申请上传链接...");
    const submit = await requestUrl({
        url: `${API}/file-urls/batch`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            files: [
                {
                    name: fileName,
                    data_id: fileName.replace(/\.pdf$/i, ""),
                    is_ocr: true,
                    language: "ch",
                },
            ],
        }),
        throw: false,
    });
    let submitJson: any = null;
    try {
        submitJson = submit.json;
    } catch {
        throw new Error(`申请失败：响应非 JSON (${submit.status})`);
    }
    if (submitJson?.code !== 0) {
        throw new Error(`申请失败: ${JSON.stringify(submitJson).slice(0, 200)}`);
    }
    const batchId: string = submitJson.data.batch_id;
    const uploadUrl: string = submitJson.data.file_urls[0];

    // 2. 上传
    onProgress?.("上传 PDF...");
    await rawPut(uploadUrl, pdf);

    // 3. 轮询解析结果
    const deadline = Date.now() + POLL_TIMEOUT;
    let last = "";
    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL);
        const r = await requestUrl({
            url: `${API}/extract-results/batch/${batchId}`,
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            throw: false,
        });
        let j: any = null;
        try {
            j = r.json;
        } catch {
            continue;
        }
        if (j?.code !== 0) continue;
        const items = j.data?.extract_result ?? [];
        const state = items.map((i: any) => `${i.file_name}=${i.state}`).join("; ");
        if (state !== last) {
            onProgress?.(`解析中: ${state}`);
            last = state;
        }
        if (items.some((i: any) => i.state === "failed")) {
            const errs = items
                .filter((i: any) => i.state === "failed")
                .map((i: any) => `${i.file_name}: ${i.err_msg ?? "?"}`)
                .join("; ");
            throw new Error(`解析失败 -> ${errs}`);
        }
        if (items.length > 0 && items.every((i: any) => i.state === "done")) {
            const zipUrl: string = items[0].full_zip_url;
            onProgress?.("下载解析结果...");
            return await downloadFullMd(zipUrl);
        }
    }
    throw new Error("轮询超时（15 分钟）");
}

async function downloadFullMd(zipUrl: string): Promise<string> {
    const zr = await requestUrl({ url: zipUrl, method: "GET", throw: false });
    if (zr.status !== 200) {
        throw new Error(`下载结果失败 ${zr.status}`);
    }
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(zr.arrayBuffer);
    const names = Object.keys(zip.files);
    const mdName =
        names.find((n) => n.endsWith("full.md")) ?? names.find((n) => n.endsWith(".md"));
    if (!mdName) {
        throw new Error("结果包中未找到 Markdown 文件");
    }
    return await zip.files[mdName].async("string");
}

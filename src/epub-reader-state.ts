export function getEpubFilePathFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const filePath = (state as { filePath?: unknown }).filePath;
  if (typeof filePath !== "string") return null;
  const trimmed = filePath.trim();
  return trimmed ? trimmed : null;
}

export function getEpubReaderErrorMessage(filePath: string | null): string {
  if (!filePath) return "未收到 EPUB 文件路径";
  return `未找到 EPUB 文件：${filePath}`;
}

export function getEpubFilePathFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  // 尝试从嵌套的state结构中提取filePath
  const stateObj = state as { state?: unknown; filePath?: unknown };
  // 先检查直接的filePath属性
  if (typeof stateObj.filePath === "string") {
    const trimmed = stateObj.filePath.trim();
    return trimmed ? trimmed : null;
  }
  // 再检查嵌套的state对象中的filePath
  if (stateObj.state && typeof stateObj.state === "object") {
    const nestedState = stateObj.state as { filePath?: unknown };
    if (typeof nestedState.filePath === "string") {
      const trimmed = nestedState.filePath.trim();
      return trimmed ? trimmed : null;
    }
  }
  return null;
}

export function getEpubReaderErrorMessage(filePath: string | null): string {
  if (!filePath) return "未收到 EPUB 文件路径";
  return `未找到 EPUB 文件：${filePath}`;
}

/**
 * Returns true when onOpen should skip rendering because setState hasn't been called yet.
 * Defer when: filePath is null AND state is not yet ready (setState hasn't populated state).
 */
export function shouldDeferEpubOpenError(filePath: string | null, stateReady: boolean): boolean {
  return !filePath && !stateReady;
}

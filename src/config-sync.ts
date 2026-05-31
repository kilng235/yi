import { App } from "obsidian";
import { NexusSettings, DEFAULT_SETTINGS } from "./types";

const CONFIG_PATH = "nexus/config.json";

export async function loadExternalConfig(app: App): Promise<Partial<NexusSettings>> {
  try {
    const exists = await app.vault.adapter.exists(CONFIG_PATH);
    if (!exists) return {};
    const content = await app.vault.adapter.read(CONFIG_PATH);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function saveExternalConfig(app: App, settings: NexusSettings): Promise<void> {
  try {
    const dirExists = await app.vault.adapter.exists("nexus");
    if (!dirExists) {
      await app.vault.createFolder("nexus");
    }
    await app.vault.adapter.write(CONFIG_PATH, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error("Failed to save external config:", e);
  }
}

export function mergeSettings(external: Partial<NexusSettings>, local: Partial<NexusSettings>): NexusSettings {
  const merged = { ...DEFAULT_SETTINGS };

  // 先应用本地配置（向后兼容）
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof NexusSettings>) {
    if (local[key] !== undefined) {
      (merged as any)[key] = local[key];
    }
  }

  // 再应用外部配置（优先级更高）
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof NexusSettings>) {
    if (external[key] !== undefined) {
      (merged as any)[key] = external[key];
    }
  }

  // heatmapWeights 需要深合并
  if (local.heatmapWeights) {
    merged.heatmapWeights = { ...DEFAULT_SETTINGS.heatmapWeights, ...local.heatmapWeights };
  }
  if (external.heatmapWeights) {
    merged.heatmapWeights = { ...merged.heatmapWeights, ...external.heatmapWeights };
  }

  return merged;
}

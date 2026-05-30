# Nexus

Obsidian 首页仪表盘插件 — 看板 + 待办 + 热力图 + 书架

## 功能

- **看板**：拖拽排序、复选框自动移动、多列管理
- **待办**：从看板卡片中提取任务，勾选自动完成
- **热力图**：GitHub 风格活动日历，支持自定义权重
- **书架**：epub 扫描与封面展示
- **Banner**：可自定义背景图和每日格言

## 开发

```bash
npm install
npm run dev    # 开发模式
npm run build  # 生产构建
```

## 架构

- 数据存储：看板存 `.md`，配置存 `data.json`
- UI 框架：原生 DOM + CSS Grid
- 构建：esbuild + TypeScript

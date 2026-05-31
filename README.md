# Nexus

Obsidian 首页仪表盘插件 — 侧边栏 + 待办 + 热力图 + 书架 + epub 阅读器

## 功能

### 侧边栏
- **快捷链接**：支持外部 URL 和 Obsidian 内部文件链接（`[[路径]]`），可增删
- **最近编辑**：自动显示最近 8 个编辑过的 `.md` 文件，带相对时间
- **DeepSeek 余额**：实时查询 API 余额（需配置 API Key）

### 待办事项
- 从看板卡片中提取任务，勾选自动完成
- 支持添加新任务
- 已完成卡片次日自动清理

### 热力图
- GitHub 风格活动日历，支持月份切换（左右箭头）
- 多数据源加权：卡片完成、笔记编辑、笔记创建、epub 阅读
- 自动回填近 30 天 vault 编辑记录
- 可自定义各项权重

### 书架
- 自动扫描 vault 中的 `.epub` 文件
- 异步加载封面图
- 内嵌 epub 阅读器（基于 epubjs），新标签页打开
- 阅读时长自动记录，左右箭头翻页

### Banner
- 支持本地图片或 URL
- 可拖动调整图片位置
- 设置面板：高度、缩放、水平/垂直位置滑块
- 自定义格言文字

### 布局
- 两栏布局：左侧栏（240px 固定）+ 右侧内容（自适应滚动）
- Banner 固定顶部
- 左右独立滚动

## 安装

1. 下载 `main.js`、`styles.css`、`manifest.json`
2. 放入 `.obsidian/plugins/nexus/`
3. 在 Obsidian 设置中启用插件

## 开发

```bash
npm install
npm run dev    # 开发模式
npm run build  # 生产构建
```

## 架构

- 数据存储：配置存 `data.json`，看板存 `.md`
- UI 框架：原生 DOM + CSS
- 构建：esbuild + TypeScript
- epub：epubjs 库

## 文件结构

```
src/
├── main.ts              # 插件入口
├── view.ts              # 主视图（两栏布局）
├── types.ts             # 类型定义
├── kanban-sync.ts       # 看板数据同步
└── modules/
    ├── sidebar.ts       # 侧边栏（快捷链接+最近编辑+余额）
    ├── banner.ts        # Banner 模块（设置面板）
    ├── todo.ts          # 待办模块
    ├── heatmap.ts       # 热力图模块（月份切换）
    ├── bookshelf.ts     # 书架模块
    ├── epub-reader.ts   # epub 阅读器
    ├── balance.ts       # DeepSeek 余额查询
    ├── kanban.ts        # 看板模块
    ├── input-modal.ts   # 输入弹窗
    └── file-picker-modal.ts  # 文件选择器
```

## 设置

| 选项 | 说明 |
|------|------|
| 看板文件 | 看板数据文件路径（不含 .md） |
| 横幅图片 | 本地 vault 路径或 URL |
| 横幅文字 | Banner 上显示的文字 |
| DeepSeek API Key | 余额查询用，仅存在本地 |

## License

MIT

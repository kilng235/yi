# Nexus Plugin

## 构建

```bash
npm run build   # 生产构建
npm run dev     # 开发模式（热更新）
```

## 代码约定

- TypeScript，esbuild 构建
- 源文件在 `src/` 下，模块在 `src/modules/`
- 类型定义集中在 `src/types.ts`
- 使用原生 DOM 操作（无框架）

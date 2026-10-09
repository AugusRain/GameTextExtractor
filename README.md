# 游戏文本提取与翻译器

从游戏目录中提取前端可见文本，导出为 JSON 批次，再调用 AI 批量翻译成简体中文。

面向 galgame、视觉小说、HTML5 / Electron 游戏等以文本资源为主的游戏，帮助译者或汉化爱好者快速拿到一份结构化的待翻译文本清单。

## 功能特性

- **目录扫描**：递归遍历游戏目录，提取 HTML 文本节点、HTML 属性、JS/TS 字符串字面量、JSON 字符串值。
- **噪声过滤**：自动丢弃纯数字、URL、data URI、文件路径、纯符号、纯大写常量等非对白文本。
- **自动去重**：按归一化后的文本去重，每条文本分配唯一递增 `id`。
- **批次导出**：每批最多 300 条，输出为 `batch-001.json`、`batch-002.json` ……
- **AI 翻译**：调用 DeepSeek 的 OpenAI 兼容接口，支持「英译中」与「日译中」两种模式。
- **结果校验**：校验译文数量与 `id` 一一对应，并检查中文字符占比，不合格自动重试（最多 3 次）。
- **断点续翻**：已存在的 `.zh.json` 默认跳过，中断后可继续跑。
- **桌面应用**：封装为 Electron 应用，带图形界面与系统文件夹选择框。

## 工作流程

```text
游戏目录
   │  npm run dev 或启动桌面应用
   ▼
扫描 (src/server/scan.ts)
   │  提取 → 过滤 → 去重 → 分配 id
   ▼
outputs/<时间戳>/batch-001.json  (每批 ≤ 300 条)
   │
   ▼
AI 批量翻译 (src/server/translate.ts)
   │  DeepSeek chat/completions
   ▼
translated-<时间戳>/batch-001.zh.json
```

## 快速开始

环境要求：Node.js 18 或更高版本（推荐 20+）。

```bash
git clone https://github.com/<your-name>/GameTextExtractor.git
cd GameTextExtractor
npm install
npm run dev
```

`npm run dev` 会同时启动前端（http://127.0.0.1:5173）和本地 API 服务（http://127.0.0.1:5174）。浏览器打开前端地址即可使用；页面上的「选择文件夹」按钮只在 Electron 环境下可用，浏览器里请手动粘贴路径。

仓库自带一个演示样本 `examples/sample-game`，可以直接拿它试跑扫描。

### 1. 扫描文本

在界面填入游戏目录（或本项目自带的 `examples/sample-game`），点击扫描。结果输出到：

```text
outputs/20260629-155351/batch-001.json
```

单项格式：

```json
{
  "text": "Start Game",
  "sourceFile": "index.html",
  "line": 7,
  "type": "html-text",
  "id": "000002"
}
```

`type` 取值：`html-text`、`html-attribute`、`js-string`、`json-string`。

扫描的覆盖范围：

| 类型 | 扩展名 |
| --- | --- |
| 参与扫描 | `.html` `.htm` `.js` `.jsx` `.ts` `.tsx` `.json` `.vue` `.css` |
| 自动跳过目录 | `node_modules` `.git` `dist` `build` `release` `.cache` |
| 自动跳过资源 | 图片、音频、视频、字体、压缩包、可执行文件等 |

### 2. 配置 API Key

翻译使用 DeepSeek 接口，需要先保存 API Key（界面中为密码框输入）：

- 默认 Base URL：`https://api.deepseek.com`
- 默认模型：`deepseek-v4-flash`

Key 的存放位置：

- 桌面应用：Electron `userData` 目录下的 `local-settings.json`
- 开发模式：项目根目录的 `.local/local-settings.json`

`.local/` 已在 `.gitignore` 中排除，不会被提交。

### 3. 批量翻译

填入待翻译的 JSON 文件夹，选择「英译中」或「日译中」，点击翻译。结果为 `batch-001.zh.json`：

```json
[
  { "id": "000001", "translatedText": "示例游戏" },
  { "id": "000002", "translatedText": "开始游戏" }
]
```

翻译参数：`temperature: 0.1`，`response_format: json_object`。若译文与原文数量不一致、出现未知 `id`，或中文字符占比低于 65%，该批次判定失败并自动重试。

## 开发命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 并行启动 Vite 前端与 API 服务（tsx watch） |
| `npm run build` | 类型检查 + 前端构建 + Electron 主进程打包（esbuild） |
| `npm start` | 以 Electron 运行构建产物 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run package:win` | 打包为 Windows 目录版 |
| `npm run package:portable` | 打包为单文件 portable exe |
| `npm run notify` | 发送 Bark 完成通知（需配置 `BARK_URL`） |

## 项目结构

```text
src/
  server/     Express API：scan.ts 扫描提取、translate.ts AI 翻译、config.ts Key 存取、app.ts 路由
  client/     React 界面（App.tsx）
  electron/   Electron 主进程，拉起本地服务并加载界面
tests/        Vitest 单元测试
examples/     演示用样本游戏
outputs/      扫描产物（已 gitignore）
```

主要 HTTP 接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/scan` | 扫描目录并导出批次 |
| POST | `/api/translate-folder` | 批量翻译 JSON 文件夹 |
| GET | `/api/api-key-status` | 查询是否已保存 Key |
| POST | `/api/save-api-key` | 保存 Key |
| POST | `/api/select-folder` | 弹出系统文件夹选择框（仅 Electron） |

## 隐私说明

- API Key 仅保存在本机，不会上传到除所配置接口地址以外的任何服务。
- 翻译时只发送提取出的文本内容，不上传游戏文件本身。
- 扫描结果默认写入本地 `outputs/` 目录。

## 当前范围与限制

这一版是 MVP，有意保持克制：

- **不回写**：翻译结果只以独立 JSON 输出，不会改写源游戏目录中的文件。
- **不处理二进制资源包**：无法提取打包进 `.pak`、`.xp3`、`.arc` 等封包或经过自定义加密的文本。
- **启发式提取**：基于正则与字符串字面量扫描，可能存在漏提（如动态拼接文本）或误提（如内部标识符）。
- **仅 Windows 打包**：打包脚本针对 Windows，代码本身跨平台。
- **单一翻译后端**：目前只实现 DeepSeek 的 OpenAI 兼容接口。

## 参与贡献

欢迎提交 Issue 与 Pull Request。本项目约定：

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，例如 `feat: add scan api`。
- 改动后请运行 `npm test`，确保测试通过。

## 开源协议

[MIT](LICENSE)

<div align="center">

# 🎓 屿宁学习助手

**学习通课程任务点自动扫描 · 视频播放管理 · AI 辅助答题**

一个基于 Manifest V3 的 Edge / Chrome 浏览器扩展

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![License: MIT](https://img.shields.io/badge/License-MIT-4CAF50?style=flat-square)](LICENSE)
[![Gitee](https://img.shields.io/badge/Gitee-zuoqiuning-C71D23?style=flat-square&logo=gitee&logoColor=white)](https://gitee.com/zuoqiuning/yuni-chaoxing-helper)
[![Version](https://img.shields.io/badge/version-0.3.2-1976d2?style=flat-square)](https://gitee.com/zuoqiuning/yuni-chaoxing-helper/releases)

[📖 使用文档](#-快速开始) · [🐛 反馈问题](https://gitee.com/zuoqiuning/yuni-chaoxing-helper/issues) · [📦 下载最新版](https://gitee.com/zuoqiuning/yuni-chaoxing-helper/releases)

</div>

---

## 📑 目录

- [✨ 功能特性](#-功能特性)
- [📸 界面预览](#-界面预览)
- [🚀 快速开始](#-快速开始)
- [📖 使用说明](#-使用说明)
- [🤖 AI 答题配置](#-ai-答题配置)
- [📁 项目结构](#-项目结构)
- [❓ 常见问题](#-常见问题)
- [🛠️ 开发者指南](#️-开发者指南)
- [🤝 贡献指南](#-贡献指南)
- [⚠️ 免责声明](#️-免责声明)
- [📄 开源协议](#-开源协议)

---

## ✨ 功能特性

### 🎯 核心功能

| 功能               | 说明                                                         |
| ------------------ | ------------------------------------------------------------ |
| 📚 **目录自动扫描** | 一次性拉取全部章节，显示完成状态（✓ / ✗）                    |
| 🎬 **视频自动播放** | 识别视频任务点，自动播放、2 倍速、播完自动切下一个           |
| 🔄 **断点续跑**     | 服务端未标记完成时自动重试，节末 / 全局双重复查              |
| 🧠 **AI 辅助答题**  | 接入 MiMo 大模型，识别单选 / 多选 / 判断 / 填空 / 简答，自动填入答案 |
| 🗂️ **多标签页隔离** | 多个课程页互不干扰，各跑各的                                 |
| 🔇 **自动静音播放** | 规避浏览器自动播放限制，静音也能正常上报进度                 |
| 🔔 **完成通知**     | 全部跑完弹出系统通知                                         |
| 🎨 **侧边栏 UI**    | 原生 sidePanel，不遮挡页面，进度条实时可见                   |

### 🔬 技术亮点

- ✅ **Manifest V3** —— 全新扩展架构，符合 Edge / Chrome 商店最新规范
- ✅ **原生 sidePanel** —— 使用浏览器原生侧边栏 API，非页面注入式浮层
- ✅ **同源 DOM 直访** —— 无需 postMessage，直接访问同源 iframe，稳定可靠
- ✅ **SPA 跳转优先** —— 优先用 SPA 切换节，避免整页刷新，速度快
- ✅ **智能预载** —— 根据 `networkState` 分流处理，减少 `metadata timeout`
- ✅ **零构建** —— 纯 JS/HTML/CSS，下载即用，无需 npm / webpack

---

## 📸 界面预览

> 📷 截图区域，建议自己补几张：

```
┌──────────────────────────────────┐
│  学习助手              ● ⚙ ↻    │
├──────────────────────────────────┤
│  ● AI 模型已接入，支持答题       │
│    mimo-v2.5 · 自动静音          │
├──────────────────────────────────┤
│  第 8/27 节 · 3.10 实现添加用户  │
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░ 30% │
├──────────────────────────────────┤
│  目录             39 节 · 未完成 34│
│  ├ 3.9  实现搜索的功能         ✓  │
│  ├ 3.10 实现添加用户的功能     ▶  │
│  ├ 3.11 添加用户修改的操作       │
│  └ 3.12 实现删除用户的操作       │
├──────────────────────────────────┤
│  当前节任务点    5 个 · 未完成 2  │
│  ├ [卡0] video · 1721741...   ✓  │
│  ├ [卡0] video · 1721741...   ▶  │
│  └ [卡0] video · 1721741...   ✗  │
├──────────────────────────────────┤
│  [ 开始刷课 ]  [ 停止 ]          │
└──────────────────────────────────┘
```

---

## 🚀 快速开始

### 环境要求

- Microsoft Edge **114+** 或 Google Chrome **114+**
- 支持 Manifest V3 的现代浏览器

### 安装步骤

#### 方式一：下载 Release 压缩包（推荐）

1. 前往 [Releases](https://gitee.com/zuoqiuning/yuni-chaoxing-helper/releases) 页面
2. 下载最新版 `yuni-chaoxing-helper-vX.X.X.zip`
3. 解压到一个**固定目录**（例如 `D:\ChaoxingHelper`，不要放临时文件夹）
4. 打开浏览器扩展管理页：
   - **Edge**：地址栏输入 `edge://extensions/`
   - **Chrome**：地址栏输入 `chrome://extensions/`
5. 打开右上角「**开发人员模式**」
6. 点「**加载解压缩的扩展**」
7. 选择解压目录（**必须选含 `manifest.json` 的那一层**）
8. ✅ 安装完成，工具栏出现扩展图标

#### 方式二：从源码克隆

```bash
git clone https://gitee.com/zuoqiuning/yuni-chaoxing-helper.git
```

然后按上面第 4-8 步加载扩展。

---

## 📖 使用说明

### 基础使用

1. **打开学习通课程页**

   ```
   https://mooc1.chaoxing.com/mycourse/studentstudy?chapterId=xxx&courseId=xxx...
   ```

2. **点扩展图标** → 侧边栏从右侧滑出，**自动扫描目录和当前节任务点**

3. **点「开始刷课」**

   扩展会自动：
   - 从第一个未完成节开始
   - 切到该节 → 扫描任务点 → 逐个播放视频
   - 每个视频播完后自动切下一个
   - 本节完成 → 切到下一未完成节
   - 全部完成 → 弹出系统通知

4. **随时可以点「停止」** —— 当前视频立即暂停，任务退出

### 界面说明

| 区域            | 作用                                |
| --------------- | ----------------------------------- |
| **顶部状态点**  | 🟢 运行中 / ⚪ 空闲                   |
| **AI 状态横条** | 显示 AI 是否接入，点击可打开设置    |
| **进度条**      | 显示当前处理到第几节 / 百分比       |
| **目录列表**    | 全部章节，✓ 已完成，蓝色高亮=当前节 |
| **任务点列表**  | 当前节的任务点，▶ 播放中，✓ 已完成  |
| **日志**        | 实时日志，红色=错误，绿色=成功      |
| **底部按钮**    | 开始 / 停止                         |

### 快捷键

| 操作           | 效果                 |
| -------------- | -------------------- |
| 点扩展图标     | 打开 / 关闭侧边栏    |
| 侧边栏右上角 ↻ | 重新扫描目录和任务点 |

---

## 🤖 AI 答题配置

> ⚠️ **AI 答题是辅助功能，答案仅供参考，请自行核实后手动提交。**

### 1. 申请 MiMo API Key

访问 [小米 MiMo 开放平台](https://platform.xiaomimimo.com/#/console/api-keys) 注册并申请 API Key。

### 2. 在扩展中配置

1. 点侧边栏右上角 **⚙** 图标
2. 填写：
   - **API Key**：`sk-xxxxxxxxxx`
   - **Base URL**：默认 `https://api.xiaomimimo.com/v1`（不用改）
   - **模型**：推荐 `mimo-v2.5`（免费额度友好）
   - **思考模式**：默认「关闭」（更快、更省 token）
3. 勾选「**检测到答题页自动填写答案**」（可选）
4. 点「**保存并验证**」

### 3. 使用

打开答题页 → 侧边栏会自动检测 → 如果开启了自动答题，会**自动**：

```
扫描题目 → 请求 AI → 填入答案
```

**提交按钮需要你手动点击。**

### 支持的题型

- ✅ 单选题
- ✅ 多选题
- ✅ 判断题
- ✅ 填空题
- ✅ 简答题

---

## 📁 项目结构

```text
yuni-chaoxing-helper/
├── manifest.json                # 扩展配置
├── README.md                    # 本文档
├── LICENSE                      # MIT 协议
├── .gitignore
│
├── background/
│   └── background.js            # Service Worker，转发 API 请求
│
├── content/                     # 注入到学习通页面的脚本
│   ├── utils.js                 # 工具函数
│   ├── dom.js                   # DOM 访问层
│   ├── catalog.js               # 目录扫描
│   ├── jobs.js                  # 任务点扫描
│   ├── player.js                # 视频播放控制
│   ├── quiz.js                  # 答题页面操作
│   ├── section.js               # 节处理流程
│   └── main.js                  # 消息入口
│
└── sidepanel/                   # 侧边栏 UI
    ├── sidepanel.html           # 页面结构
    ├── sidepanel.css            # 样式
    ├── sidepanel.js             # 入口
    └── modules/
        ├── utils.js             # 工具 + 全局状态
        ├── storage.js           # 配置读写
        ├── ai.js                # AI 请求与验证
        ├── render.js            # 列表渲染
        ├── scan.js              # 扫描调度
        ├── quiz.js              # 答题 UI 流程
        ├── settings.js          # 设置弹窗
        ├── status.js            # AI 状态横条
        └── task.js              # 主任务流程
```

### 架构说明

```
┌─────────────────────────────────────────────────────┐
│                  顶层页面 (studentstudy)             │
│  ┌─────────────────┐        ┌──────────────────┐   │
│  │  content/main   │◄──────►│  sidepanel       │   │
│  │  + catalog      │ 消息   │  + modules       │   │
│  │  + jobs         │ 通道   │                  │   │
│  │  + player       │        │                  │   │
│  │  + section      │        │                  │   │
│  │  + quiz         │        │                  │   │
│  └────────┬────────┘        └────────┬─────────┘   │
│           │                          │              │
│           │ 同源访问                  │ 消息         │
│           ▼                          ▼              │
│  ┌─────────────────┐        ┌──────────────────┐   │
│  │  cards iframe   │        │  background      │   │
│  │  video iframe   │        │  (Service Worker)│   │
│  └─────────────────┘        └──────────────────┘   │
└─────────────────────────────────────────────────────┘
```

- **content** 脚本只在顶层 `studentstudy` 页面注入
- 通过 `iframe.contentDocument` **同源直访** cards / video iframe
- **sidepanel** 通过 `chrome.tabs.sendMessage` 与 content 通信
- **background** 负责转发 MiMo API 请求（避免 CSP 问题）

---

## ❓ 常见问题

<details>
<summary><b>Q1：点击扩展图标没反应？</b></summary>

1. 确认当前标签页是 `chaoxing.com` 域名
2. 打开 F12 → Console，搜 `[CXH] main loaded`
   - 有 → content script 注入成功，问题在 sidepanel
   - 无 → 刷新页面（Ctrl+Shift+R）再试
3. 如果还是不行，`edge://extensions/` 里点「重新加载」
</details>

<details>
<summary><b>Q2：视频一直在重试 <code>metadata timeout</code>？</b></summary>

这是网络慢导致视频源没加载完成。扩展已经内置了：
- 显式 `load()` 触发加载
- NO_SOURCE 时自动重置 src
- 20 秒超时后二次兜底

如果还频繁出现：
- 检查网络
- 换个人少的时间段跑
</details>

<details>
<summary><b>Q3：视频播放没声音？</b></summary>

浏览器自动播放策略限制。两种解决：
1. 手动点击一下学习通页面任意位置（激活用户手势）
2. 或在设置里开启「**自动静音播放**」

静音播放不影响进度上报。
</details>

<details>
<summary><b>Q4：任务点完成后目录没变绿？</b></summary>

扩展每节完成后会**重扫目录**确认服务端状态。如果没变绿：
- 服务端可能还没更新，等 5-10 秒
- 或者该节还有其他任务点未完成

会**自动重试**，最多 3 次。
</details>

<details>
<summary><b>Q5：AI 答题答案不准？</b></summary>

AI 答案仅供参考，**不要直接提交**。建议：
- 看一眼答案是否合理
- 修改明显错误
- 全部核对后再提交

MiMo 的准确率取决于题目难度和领域，一般 70-85%。
</details>

<details>
<summary><b>Q6：多个标签页可以同时跑吗？</b></summary>

**不支持**。Edge 的 sidePanel 全局唯一，同一时间只能跑一个任务。

但可以：
- 一个跑完后再跑另一个
- 或者用多个浏览器配置文件
</details>

<details>
<summary><b>Q7：加载扩展时提示 "Manifest is not valid JSON"？</b></summary>

- 压缩包里多了一层目录？最外层必须**直接**是 `manifest.json`
- 或者你选了错误的目录
- 确认选择的目录里**直接**有 `manifest.json`
</details>

---

## 🛠️ 开发者指南

### 项目架构

- **零构建** —— 直接写、直接跑，无 webpack/vite
- **模块化** —— 每个文件单一职责，通过 `window.__CXH` / `window.SP` 命名空间共享
- **扁平结构** —— 根目录 + 3 个子目录，避免深层嵌套

### 本地开发流程

1. 修改代码
2. `edge://extensions/` → 点「**重新加载**」图标
3. 刷新学习通页面（Ctrl+Shift+R）
4. 打开 sidepanel 查看日志

### 一键导出项目代码

仓库自带 `export.ps1`，双击即可导出完整代码到 `项目代码.md`：

- 包含目录树
- 包含每个文件的完整代码
- 排除 `.md` / `.git` / `node_modules` / 压缩包

**保存为 UTF-8 with BOM 后双击运行。**

### 调试技巧

**查看 content script 是否注入**：

```js
// 在课程页 F12 Console
console.log(window.__CXH, window.__CXH_MAIN_LOADED);
```

**查看 sidepanel 内部状态**：

```js
// 在 sidepanel 的 DevTools Console（右键 → 检查）
console.log(window.SP.state);
```

**查看存储的 API Key**：

```js
// 在 sidepanel Console
chrome.storage.local.get(null).then(console.log);
```

---

## 🤝 贡献指南

欢迎提 Issue 和 PR！

### 提交 Issue

请包含：
- **扩展版本号**（侧边栏底部或扩展管理页可见）
- **浏览器版本**（`edge://version` 复制）
- **问题描述**（截图 + 复现步骤）
- **F12 控制台日志**（搜 `[CXH]` 和 `[SP]`）

### 提交 PR

1. Fork 本仓库
2. 新建分支：`git checkout -b feat/your-feature`
3. 提交：`git commit -m "feat: 添加 xxx"`
4. 推送：`git push origin feat/your-feature`
5. 开 Pull Request

**Commit 规范**：
- `feat: xxx` 新功能
- `fix: xxx` 修复 bug
- `docs: xxx` 文档
- `refactor: xxx` 重构
- `style: xxx` 格式
- `chore: xxx` 杂项

---

## ⚠️ 免责声明

**本项目仅供个人学习与技术研究使用。**

- 使用者应遵守学习通平台的服务条款
- 请勿用于商业用途或大规模刷课
- 因使用本扩展产生的**任何后果由使用者自行承担**
- AI 生成的答案是**辅助内容**，不保证准确性，请自行核实
- 本扩展**不会**自动提交任何答题结果
- 本项目与学习通 / 超星官方**没有任何关系**

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

你可以自由地：
- ✅ 商业使用
- ✅ 修改
- ✅ 分发
- ✅ 私用

唯一要求：**保留原作者版权声明**。

---

## 📊 项目状态

![Stars](https://img.shields.io/badge/stars-welcome-yellow?style=flat-square)
![Forks](https://img.shields.io/badge/forks-welcome-blue?style=flat-square)
![Issues](https://img.shields.io/badge/issues-welcome-green?style=flat-square)

---

## 🙏 致谢

- 感谢所有提交 Issue 和 PR 的朋友
- 感谢 [MiMo](https://api.xiaomimimo.com) 提供的 AI 能力
- 感谢 [shields.io](https://shields.io) 提供徽章服务

---

<div align="center">

**如果这个项目对你有帮助，欢迎点个 ⭐ Star！**

Made with ❤️ by [zuoqiuning](https://gitee.com/zuoqiuning)

</div>
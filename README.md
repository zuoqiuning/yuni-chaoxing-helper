# 屿宁学习助手

学习通课程任务点自动扫描、视频播放管理与 AI 辅助答题的 Edge / Chrome 浏览器扩展。

---

## 功能

| 功能         | 说明                                                         |
| ------------ | ------------------------------------------------------------ |
| 目录扫描     | 一次拉取全部章节，显示完成状态                               |
| 视频自动播放 | 识别视频任务点，自动播放、2 倍速、播完切换下一个             |
| 断点续跑     | 服务端未标记完成时自动重试，节末 / 全局双重复查              |
| AI 辅助答题  | 接入 MiMo 大模型，识别单选 / 多选 / 判断 / 填空 / 简答，自动填入答案 |
| 标签页隔离   | 多个课程页互不干扰                                           |
| 自动静音     | 规避浏览器自动播放限制                                       |

---

## 安装

### 从源码加载

```bash
git clone https://gitee.com/zuoqiuning/yuni-chaoxing-helper.git
```

1. 打开 `edge://extensions/`（Chrome 用 `chrome://extensions/`）
2. 打开右上角「开发人员模式」
3. 点「加载解压缩的扩展」，选择仓库根目录

### 使用

1. 打开学习通课程页：`mooc1.chaoxing.com/mycourse/studentstudy?...`
2. 点扩展图标打开侧边栏，自动扫描目录和任务点
3. 点「开始刷课」

---

## AI 答题配置（可选）

1. 前往 [MiMo 开放平台](https://platform.xiaomimimo.com) 申请 API Key
2. 点侧边栏右上角设置图标
3. 填入 API Key，选择模型（推荐 `mimo-v2.5`）
4. 保存并验证
5. 打开答题页 → 扫描题目 → AI 答题 → 填入答案
6. 手动点提交

> AI 答案仅供参考，请自行核实后提交。

---

## 项目结构

```text
yuni-chaoxing-helper/
├── manifest.json
├── background/           Service Worker
├── content/              注入学习通页面的脚本
├── sidepanel/            侧边栏 UI
│   └── modules/          侧边栏模块
├── README.md
└── LICENSE
```

---

## 技术说明

- Manifest V3
- 原生 sidePanel API
- 同源 DOM 直访，无需 postMessage
- SPA 跳转优先，减少整页刷新
- 零构建，纯 JS / HTML / CSS

---

## 免责声明

本项目仅供个人学习与技术研究使用。

- 使用者应遵守学习通平台的服务条款
- 因使用本扩展产生的任何后果由使用者自行承担
- AI 生成的答案为辅助内容，不保证准确性
- 请勿用于商业用途或大规模刷课

---

## License

[MIT](LICENSE)
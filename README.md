<p align="center">
  <img src="assets/branding/weport-icon.png" width="112" alt="聊迹图标" />
</p>

<h1 align="center">聊迹</h1>

<p align="center">
  在本机浏览、检索、导出和分析微信 4.x 数据
</p>

<p align="center">
  Windows x64 · macOS Apple Silicon · Linux x64
</p>

> 工程名与安装包名称暂时沿用 **Weport**，应用界面品牌为 **聊迹**。

聊迹是一款基于 Electron、React 和 WCDB 的桌面工具。它直接读取你电脑上的微信 4.x 数据，在本地完成聊天浏览、全文搜索、联系人整理、记录导出、朋友圈归档和数据分析；需要更深入的总结时，也可以连接你自己配置的 AI 模型。

本项目不是微信官方产品，也不会代替微信发送消息。请只处理本人账号的数据，并在使用前阅读下方的[隐私说明](#隐私与安全)与[免责声明](#免责声明)。

## 主要功能

| 功能 | 能力 |
| --- | --- |
| 聊天浏览 | 查看私聊、群聊和公众号会话；支持全局搜索、会话内搜索、日期跳转、图片预览、语音播放与本地转写 |
| 联系人 | 按好友、群聊、公众号、已删除联系人和黑名单筛选；可导出 CSV、JSON 或 VCF |
| 聊天导出 | 按账号、会话和日期范围导出；支持 PDF、TXT、JSON、HTML、XLSX、Markdown、ChatLab、JSONL、Arkme JSON 与 WeClone CSV |
| 媒体处理 | 可选导出图片、视频、语音、表情和文件；Windows/Linux 支持微信 4.x 图片密钥与 `.dat` 解密 |
| 语音转文字 | 按需下载 SenseVoice 模型，在本机转写语音，并把结果写入导出文件 |
| 朋友圈 | 浏览本地时间线，按发布者、关键词和日期筛选；支持媒体预览、归档导出与可选防删除 |
| 数据分析 | 全局统计、联系排行榜、活跃日历、高频词云、群成员画像、7×24 热力图、年度报告和双人报告 |
| 聊迹 AI | 通过本地检索工具分析聊天历史，支持多家在线模型和本地兼容接口，并维护可控的长期记忆与笔记 |
| 消息与防撤回 | 独立置顶通知窗口、会话过滤、位置与动效设置；可按会话安装或还原本地防撤回触发器 |
| 本地接口 | 提供带令牌认证的只读 MCP 服务；另有可选的本地 HTTP API，方便其他工具读取数据 |
| 数据备份 | 将消息、联系人和朋友圈等数据库快照打包保存，并可按需包含媒体文件 |

## 快速开始

### 下载安装包

前往 [Releases](https://github.com/weiyeye/liaojiWechat/releases) 下载与你的平台对应的文件：

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows x64 | `Weport-*-Setup.exe` | NSIS 安装包，支持选择安装目录 |
| macOS arm64 | `Weport-*-arm64.dmg` / `.zip` | 适用于 Apple Silicon；Intel Mac 暂不支持 |
| Linux x64 | `Weport-*-x64.AppImage` / `.tar.gz` | 自 v0.9.10 起提供 |

如果 Releases 暂无可用安装包，请按[从源码运行](#从源码运行)操作。

### 连接微信

1. 启动聊迹，进入「连接微信」。
2. 选择微信数据目录，或使用自动扫描：
   - Windows：微信数据目录中的 `xwechat_files`
   - macOS：微信容器目录中的微信 4.x 数据目录
   - Linux：通常为 `~/xwechat_files`
3. 选择账号并获取数据库解密密钥。
4. 密钥验证通过后，即可使用聊天、联系人、导出、朋友圈和分析功能。

### 获取数据库密钥

数据库密钥需要在微信登录时捕获：

1. 在微信电脑版「设置 → 通用」中关闭自动登录，然后退出当前账号。
2. 在聊迹中点击「提取密钥」，等待“已准备就绪”的提示。
3. 使用手机扫码登录微信；登录成功时，密钥会自动捕获并填入。
4. 如果已有 64 位十六进制密钥，也可以手动粘贴并点击「确认密钥并连接」。

> macOS 获取密钥需要进程调试权限，可能需要关闭 SIP 或按系统提示授权；Linux 可能弹出 sudo 授权。请勿在 Issue、日志或截图中公开数据库密钥。

Windows/Linux 导出微信 4.x 图片时还需要图片密钥。请先在微信中打开几张图片，再在「连接微信」页获取图片密钥；macOS 的当前媒体路径不需要该步骤。

## 导出说明

默认导出格式为 PDF，默认覆盖同名文件，并按格式写入独立子目录。可以选择全部会话，也可以筛选后只导出指定私聊、群聊或公众号。

| 格式 | 适用场景 |
| --- | --- |
| PDF | 阅读、归档和分享；支持中文排版以及已导出的图片、表情 |
| TXT / Markdown | 轻量阅读、全文搜索或交给其他文本工具处理 |
| JSON | 保留完整结构化消息信息，便于二次开发 |
| HTML | 在浏览器中离线查看，适合大段聊天记录 |
| XLSX | 使用 Excel 进行筛选和统计 |
| ChatLab / ChatLab JSONL | 与 ChatLab 生态交换聊天数据 |
| Arkme JSON | 导入兼容 Arkme 数据结构的工具 |
| WeClone CSV | 为 WeClone 数据处理流程准备训练数据 |

媒体导出会自动使用每个会话独立目录。语音转文字首次使用时需要联网下载模型，识别过程在本机完成，模型默认保存在用户文档目录的 `Weport/models/sensevoice` 下。

联系人可单独导出为 CSV、JSON 或 VCF。VCF 只包含好友，群聊和公众号会自动跳过。

## 聊迹 AI（WeportAI）

聊迹 AI 是建立在本地聊天检索工具之上的分析助手。你可以用自然语言查找某一天发生的事情、梳理一段关系、总结群聊主题，或生成基于聊天历史的长期画像。

- 支持 OpenAI、Anthropic、Google Gemini、DeepSeek 及多种 OpenAI-compatible 服务。
- 支持 Ollama、LM Studio 等本地接口。
- 可配置多个提供商、模型、API 地址和最大执行步数。
- 工具调用过程、上下文占用、缓存命中和费用估算可见。
- 长期记忆和分析笔记保存在所选导出目录的 `WeportAI/` 中，可直接查看和删除。

只有在你主动配置并使用 AI 时，相关聊天文本才会发送给所选模型服务。数据库文件、媒体原文件和解密密钥不会作为 AI 请求上传。

## MCP 服务

应用默认在 `127.0.0.1:5032/mcp` 提供带 Bearer Token 的 Streamable HTTP MCP 服务，内置会话、消息搜索、联系人、群成员、朋友圈和统计分析等只读工具，不提供发送、修改或删除聊天数据的能力。

仅支持 stdio 的 AI 客户端可以使用安装目录中的 `resources/mcp/mcp-stdio-bridge.cjs` 进行桥接：

```json
{
  "mcpServers": {
    "liaoji": {
      "command": "<安装目录>/resources/mcp/mcp-stdio-bridge.cjs",
      "args": ["--port", "5032", "--token", "<MCP_TOKEN>"]
    }
  }
}
```

令牌由本机 `mcpToken` 配置项提供；未设置时会在首次启动服务时自动生成，并在系统安全存储可用时加密保存。不要把 MCP 服务暴露到公网，也不要公开访问令牌。

## 平台支持

| 平台 | 状态 | 注意事项 |
| --- | --- | --- |
| Windows 10/11 x64 | 支持 | 微信 4.x；通知窗口可使用原生液态玻璃效果 |
| macOS Apple Silicon | 支持 | 微信 4.x；安装包为 ad-hoc 签名，首次打开需右键选择“打开” |
| Linux x64 | 支持 | 微信 4.x；自动获取密钥可能请求 sudo，首次使用请先验证数据库连接 |
| macOS Intel x64 | 暂不支持 | 当前未提供 x64 原生资源与安装包 |

关闭主窗口默认会隐藏到托盘，而不是退出应用。请通过托盘菜单退出；开机自启时可使用静默后台模式。

## 从源码运行

### 环境要求

- Node.js 20 或更高版本
- npm
- Git
- 对应平台的构建环境；安装包必须在目标操作系统上构建

```bash
git clone https://github.com/weiyeye/liaojiWechat.git
cd liaojiWechat
npm install
npm run dev
```

### 常用命令

```bash
npm run typecheck   # 检查渲染进程与 Electron 主进程类型
npm run build       # Windows：构建 NSIS 安装包
npm run build:dir   # 构建当前平台的免安装目录
npm run build:mac   # macOS：构建 arm64 DMG 与 ZIP
npm run build:linux # Linux：构建 x64 AppImage 与 tar.gz
```

Windows 可运行完整 UI 截图冒烟测试：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/capture-ui.ps1
```

macOS 打包前需要恢复原生 helper 的可执行位：

```bash
chmod +x resources/key/macos/universal/*
chmod +x resources/welive/macos/arm64/welive
```

Linux 打包前需要执行：

```bash
chmod +x resources/key/linux/x64/xkey_helper_linux
```

## 项目结构

```text
electron/
  appMain.ts                 Electron 主进程、窗口、托盘与 IPC
  wcdbHost.ts                独立 WCDB 宿主进程
  services/                  数据库、密钥、导出、媒体、AI、分析与接口服务
  windows/                   通知窗口
src/
  pages/                     聊天、联系人、朋友圈、分析等页面
  components/                通用组件与业务组件
  utils/                     渲染层工具
resources/                   各平台原生库、helper、MCP 桥接与运行时资源
scripts/                     构建、打包、资源准备和 UI 验证脚本
docs/                        法律来源记录、实现说明与界面截图
```

WCDB 引擎运行在独立的 Node 子进程中，通过 Electron IPC 通信。这个结构用于满足原生库的宿主文件名要求，同时避免启动第二套 Chromium 实例。

## 隐私与安全

- 聊天数据库、联系人、分析结果和常规导出均在本机处理。
- 应用只读取你选择的数据目录；防撤回、防删除等功能只有在你明确开启时才会修改本地数据库触发器。
- AI 功能会把完成当前任务所需的聊天文本发送给你配置的模型服务；使用前请阅读该服务的隐私政策。
- 语音识别模型需要首次联网下载，但语音识别在本机执行。
- MCP 与 HTTP API 默认用于本机回环地址；令牌应视为敏感信息。
- 密钥在系统安全存储可用时加密保存。请同时保护好操作系统账户和用户数据目录。
- 自动截图与视觉测试使用脱敏演示数据，不应包含真实聊天内容。

## 常见问题

### 一直无法获取数据库密钥

确认微信已关闭自动登录，并且是在聊迹显示“已准备就绪”之后重新扫码登录。仍失败时，完全退出微信和聊迹后重试，并检查系统是否拦截了进程调试或管理员授权。

### 导出的图片只有占位文字

Windows/Linux 请先在微信中打开几张图片，再获取图片密钥。确认导出设置中已启用“图片”，并检查媒体文件是否仍保存在原微信数据目录。

### 点击关闭后应用仍在运行

这是托盘模式的预期行为。点击托盘图标可以恢复窗口，通过托盘菜单“退出”才会完全结束进程。

### 是否必须联网

聊天读取、搜索、统计和常规导出不依赖云端。头像或朋友圈媒体补全、语音模型首次下载、自动更新以及在线 AI 提供商需要网络。

## 免责声明

本工具仅供个人学习与本地数据归档使用。请遵守微信《软件许可及服务协议》以及所在国家或地区的法律法规，并且只处理本人有权访问的数据。因侵犯隐私、违反服务条款、未经授权处理他人数据或其他不当使用造成的后果，由使用者自行承担。

本项目与腾讯、微信及其关联公司无隶属、授权或背书关系。

## 许可证与致谢

本项目基于 **cc / hicccc77 与 WeFlow 贡献者**的 [WeFlow](https://github.com/hicccc77/WeFlow) 修改，并包含后续 Weport 适配与聊迹界面改动。

项目整体依据 [CC BY-NC-SA 4.0](LICENSE) 分发：使用和再发布时必须保留署名，仅限非商业用途，修改版本需采用相同或兼容许可证。第三方组件继续适用各自许可证。

- [署名与修改说明](NOTICE.md)
- [第三方组件声明](THIRD-PARTY-NOTICES.md)
- [法律来源核查记录](docs/LEGAL-PROVENANCE.md)
- [版本更新记录](RELEASE_NOTES.md)

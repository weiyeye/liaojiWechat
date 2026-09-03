# Weport UI Design System

> 状态：vNext 设计基线。后续 UI 改造以本文件为准。
>
> 方向：**Precision Desktop / 精密工作台**。

## 1. 设计结论

Weport 是高信息密度的本地桌面工具，不是展示型网站。界面应让用户快速完成
连接、查看、筛选、导出和分析，而不是依靠大量卡片、渐变和装饰制造视觉效果。

核心原则：

1. 内容优先：导航和容器退后，联系人、消息、数据和任务状态靠前。
2. 层级明确：主要依靠背景层级、间距和字体区分结构，减少“卡片套卡片”。
3. 单一强调色：蓝色只用于当前状态、主操作、链接和焦点，不为不同菜单随机着色。
4. 高密度但不拥挤：列表紧凑、字段对齐、操作稳定，避免巨型标题和过度留白。
5. 桌面优先：支持鼠标、键盘、窗口缩放和长列表；不按移动端网页思路设计。
6. 状态就近反馈：加载、进度、失败和完成信息出现在任务附近，Toast 只做结果提醒。

不采用：玻璃拟态、霓虹赛博风、大面积渐变、重阴影、彩虹图标、过多胶囊按钮。

## 2. 应用骨架

默认窗口：`1280 × 860`。继续支持当前 `920 × 600` 最小窗口。

```text
┌──────────────────┬──────────────────────────────────────────────────┐
│ 品牌 / 账号       │ 页面标题 / 上下文                         主操作 │ 52
│                  ├──────────────────────────────────────────────────┤
│ 工作             │                                                  │
│  聊天            │                                                  │
│  联系人          │                页面内容区                         │
│  导出            │                                                  │
│                  │                                                  │
│ 洞察             │                                                  │
│  朋友圈          │                                                  │
│  分析            │                                                  │
│                  │                                                  │
│ 消息通知          │                                                  │
│──────────────────│                                                  │
│ 微信连接状态      │                                                  │
│ 设置             │                                                  │
└──────────────────┴──────────────────────────────────────────────────┘
       196                            自适应
```

### 主导航

- 默认宽度：`196px`。
- 紧凑宽度：`64px`，窗口宽度小于 `1080px` 时自动收起文字。
- 导航项高度：`36px`；左右内边距 `10px`；图标 `16px`。
- 品牌位于顶部；连接状态和设置固定在底部。
- “连接微信”不再长期占用一级导航：未连接时作为启动引导；连接后显示为底部账号状态入口。
- 当前项使用蓝色文字、蓝色图标和低透明蓝色背景，不使用白底反色。

### 页面标题栏

- 高度：`52px`，固定在内容区顶部。
- 左侧：页面标题、数量或当前对象。
- 中部：页面级搜索、筛选或分段控制，仅在需要时出现。
- 右侧：一项主操作和少量次操作。
- 不重复显示已经在侧栏中出现的模块名称说明。

### 内容区

- 页面外边距：`16px`；复杂数据页可使用 `12px`。
- 面板间距：`12px`。
- 普通内容最大宽度：`1200px`；聊天、联系人等工作台页面铺满可用宽度。
- 页面自身管理滚动，主导航和页面标题栏保持稳定。

## 3. 页面排版模板

| 页面 | 推荐结构 | 固定尺寸 | 行为 |
|---|---|---:|---|
| 聊天 | 会话列表 / 消息内容 / 可选详情 | `280 / 1fr / 300` | 小窗口隐藏详情栏 |
| 联系人 | 联系人列表 / 详情或导出设置 | `340 / 1fr` | 列表与右侧分别滚动 |
| 导出 | 会话选择 / 导出配置 | `320 / 1fr` | 主导出按钮固定在配置区底部 |
| 朋友圈 | 筛选栏 / 动态流 | `260 / 1fr` | 媒体预览使用覆盖层 |
| 分析 | 页面工具栏 / 数据画布 | `1fr` | 图表按阅读顺序排列，不追求等高卡片 |
| 消息通知 | 状态概览 / 设置列表 | `760px` 最大宽度 | 使用分组行，不使用大量独立卡片 |
| 设置 | 单列分组设置 | `860px` 最大宽度 | 分隔线分组，危险操作放最后 |

### 列表—详情页面

- 搜索和筛选固定在列表顶部。
- 批量选择工具栏仅在进入选择状态后出现，避免长期占用空间。
- 默认列表行高 `52px`；包含摘要时使用 `60px`。
- 头像 `36px`；主名称 `13px / 600`；辅助信息 `11px / 400`。
- 当前行以背景和左侧 `2px` 指示条标识，不用厚描边。
- 大列表继续使用虚拟滚动。

### 表单和设置页面

- 每组使用“标题 + 一句说明 + 设置行”，组间间距 `24px`。
- 设置行最小高度 `48px`，标签在左，控件在右。
- 只有真正独立、可被整体操作的内容才使用面板边框。
- 高级选项默认折叠；危险操作与普通设置保持至少 `24px` 距离。

## 4. 固定深色主题

主题名称：**Graphite Blue / 石墨蓝**。

主识别色是 `#6B96FF`，主按钮填充色是更深的 `#3D66D1`。整体颜色比例：
中性色约 90%，蓝色约 8%，成功/警告/危险状态色不超过 2%。

### 4.1 Primitive tokens

```css
:root {
  /* 中性色 */
  --wp-neutral-1000: #090B10;
  --wp-neutral-950: #0D1016;
  --wp-neutral-900: #12161E;
  --wp-neutral-850: #171C26;
  --wp-neutral-800: #1D2430;
  --wp-neutral-700: #272F3D;
  --wp-neutral-600: #394557;
  --wp-neutral-500: #596273;
  --wp-neutral-400: #818C9E;
  --wp-neutral-300: #B4BDCA;
  --wp-neutral-100: #F3F5F8;

  /* 品牌蓝 */
  --wp-blue-300: #9AB9FF;
  --wp-blue-400: #7FA7FF;
  --wp-blue-500: #6B96FF;
  --wp-blue-650: #3D66D1;
  --wp-blue-700: #345CC6;
  --wp-blue-800: #2D51B3;

  /* 状态色 */
  --wp-green-500: #45C486;
  --wp-amber-500: #E6A13A;
  --wp-red-500: #ED6571;

  /* 透明色 */
  --wp-blue-a08: rgb(107 150 255 / 8%);
  --wp-blue-a14: rgb(107 150 255 / 14%);
  --wp-blue-a28: rgb(107 150 255 / 28%);
  --wp-white-a04: rgb(255 255 255 / 4%);
  --wp-black-a32: rgb(0 0 0 / 32%);
}
```

### 4.2 Semantic tokens

```css
:root {
  --color-bg-canvas: var(--wp-neutral-1000);
  --color-bg-sidebar: var(--wp-neutral-950);
  --color-bg-surface: var(--wp-neutral-900);
  --color-bg-elevated: var(--wp-neutral-850);
  --color-bg-hover: var(--wp-neutral-800);
  --color-bg-selected: var(--wp-blue-a14);

  --color-border: var(--wp-neutral-700);
  --color-border-strong: var(--wp-neutral-600);
  --color-border-focus: var(--wp-blue-500);

  --color-text-primary: var(--wp-neutral-100);
  --color-text-secondary: var(--wp-neutral-300);
  --color-text-muted: var(--wp-neutral-400);
  --color-text-disabled: var(--wp-neutral-500);

  --color-accent: var(--wp-blue-500);
  --color-accent-hover: var(--wp-blue-400);
  --color-action: var(--wp-blue-650);
  --color-action-hover: var(--wp-blue-700);
  --color-action-pressed: var(--wp-blue-800);

  --color-success: var(--wp-green-500);
  --color-warning: var(--wp-amber-500);
  --color-danger: var(--wp-red-500);
}
```

对比度基线：主文字/画布约 `18:1`，次文字/面板约 `9.5:1`，弱文字/面板约
`5.3:1`，蓝色链接/面板约 `6.4:1`，主按钮文字/按钮约 `4.8:1`。

### 4.3 Component tokens

```css
:root {
  --sidebar-bg: var(--color-bg-sidebar);
  --toolbar-bg: var(--color-bg-canvas);
  --panel-bg: var(--color-bg-surface);
  --panel-border: var(--color-border);

  --button-primary-bg: var(--color-action);
  --button-primary-bg-hover: var(--color-action-hover);
  --button-primary-bg-pressed: var(--color-action-pressed);
  --button-primary-fg: var(--color-text-primary);

  --input-bg: var(--color-bg-canvas);
  --input-border: var(--color-border);
  --input-border-focus: var(--color-border-focus);

  --list-row-bg-hover: var(--color-bg-hover);
  --list-row-bg-selected: var(--color-bg-selected);
  --list-row-indicator: var(--color-accent);
}
```

组件代码只使用 semantic 或 component tokens，不直接写十六进制颜色。

## 5. 图表配色

- 单序列与强弱排序：只使用蓝色梯度。
- 多类别图表只有在类别无法通过位置或标签区分时才使用多色，最多 5 色。
- 网格线使用 `--color-border`，Tooltip 使用 elevated surface。
- 数字标签默认用主文字色，不把每个数字染成系列色。

```text
顺序蓝：#1E376B → #2D55A6 → #3D66D1 → #6B96FF → #9AB9FF
类别色：#6B96FF / #4FC7B0 / #A78BFA / #E6A13A / #ED6571
```

## 6. 字体与数字

```css
:root {
  --font-ui: "Segoe UI Variable Text", "SF Pro Text", "PingFang SC",
    "Microsoft YaHei UI", system-ui, sans-serif;
  --font-mono: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;

  --font-size-caption: 11px;
  --font-size-meta: 12px;
  --font-size-body: 13px;
  --font-size-control: 13px;
  --font-size-section: 15px;
  --font-size-page: 20px;
  --font-size-metric: 28px;
}
```

- 页面标题：`20px / 650`。
- 分组标题：`15px / 600`。
- 正文与控件：`13px / 400–550`。
- 辅助信息：`11–12px / 400`。
- 路径、wxid、密钥片段和技术字段使用等宽字体。
- 统计数字使用 tabular numbers；避免为了“高级感”降低文字对比度。

## 7. 间距、圆角和阴影

基础单位为 `4px`。

```text
间距：4 / 8 / 12 / 16 / 24 / 32
圆角：6（小控件）/ 8（按钮与输入框）/ 10（面板）/ 12（弹窗）
控件高度：28（紧凑）/ 36（默认）/ 40（主操作）
边框：1px；当前项指示条：2px
```

- 普通面板不使用阴影。
- 下拉菜单：`0 8px 24px rgb(0 0 0 / 32%)`。
- 弹窗：`0 20px 60px rgb(0 0 0 / 42%)`。
- 胶囊形状只用于状态标签、数量徽标和筛选标签。

## 8. 组件状态

| 组件 | 默认 | Hover | Active / Selected | Disabled |
|---|---|---|---|---|
| 主按钮 | 深蓝填充 | 更深蓝 | 最深蓝 | elevated 背景 + disabled 文字 |
| 次按钮 | surface + 边框 | hover 背景 | selected 背景 | 降低文字层级 |
| 输入框 | canvas + 边框 | 强边框 | 蓝色边框 + 2px 柔和焦点环 | surface 背景 |
| 列表行 | 透明 | hover 背景 | 蓝色弱背景 + 左指示条 | 文字弱化 |
| 导航项 | 透明 | hover 背景 | 蓝色弱背景 + 蓝色文字 | 不显示或弱化 |

加载状态使用局部骨架或小型旋转指示器；不让整个页面闪烁。长任务必须显示进度、当前阶段、
取消入口和最终结果。危险操作仅在确认阶段使用红色主按钮。

## 9. 响应式规则

| 内容宽度 | 规则 |
|---:|---|
| `≥ 1080px` | 展开侧栏；允许三栏聊天布局 |
| `920–1079px` | 侧栏收为 64px；隐藏聊天详情栏；双栏宽度压缩 |
| `< 920px` | 不作为主要目标；保持当前应用最小宽度限制 |

窗口变窄时优先隐藏次要详情和说明，不缩小主列表到不可用宽度，也不把桌面工作台改成纵向长页。

## 10. 落地顺序与验收

1. 建立三层 token，并替换全局背景、文字、边框和按钮颜色。
2. 把顶部导航迁移为左侧导航，完成窗口骨架。
3. 用联系人页和聊天页验证列表—详情模板。
4. 迁移导出页，统一筛选、选择、进度和底部主操作。
5. 迁移朋友圈、分析、通知和设置。
6. 最后删除旧样式、重复组件和页面内硬编码颜色。

验收标准：

- `1280 × 860` 和 `920 × 600` 均无重叠、横向溢出或主操作丢失。
- 键盘焦点始终可见；正文、弱文字和按钮满足 WCAG AA 对比度。
- 同一种搜索、筛选、选择和状态反馈在所有页面视觉与行为一致。
- 顶级导航不再使用多色图标；页面不出现无意义渐变和多层卡片嵌套。
- 长列表继续虚拟化；切换页面不应产生明显布局跳动。

## 11. 方法来源

- Linear：以真实页面状态验证统一视觉语言，并用变量系统组织表面、文字、图标和控件。
  <https://linear.app/now/how-we-redesigned-the-linear-ui>
- Microsoft Windows：超过 5 个顶级入口适合左侧导航；联系人等高频切换场景适合列表—详情布局。
  <https://learn.microsoft.com/en-us/windows/apps/design/basics/navigation-basics>
- Edward Tufte：数据界面优先清晰、效率和真实比较，装饰不得压过信息。
  <https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/>

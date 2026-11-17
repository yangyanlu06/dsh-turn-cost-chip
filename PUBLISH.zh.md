# 发布这个插件（第一次上架）

先纠正一件事：**DeepSeek 没有「上传插件」的官方入口，也没有官方商店。** 你在这个应用里看到的「插件市场」是社区插件 `dshmarket`，它读的是社区精选目录 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。所以「上架到市场」= **一个你自己的 GitHub 仓库 + 给那个目录提一个 yml 文件的 PR**。

本文按真实规则写（2026-11 核对过官方博客文档与那个目录的 `contributing.md`）。下面出现的 `<OWNER>` / `<REPO>` 等占位符，填上你的 GitHub 用户名和仓库名即可。

> **本次发布的目标已确定**：`OWNER = yangyanlu06`，`REPO = dsh-turn-cost-chip`，
> 即仓库 <https://github.com/yangyanlu06/dsh-turn-cost-chip>，包名 `dsh-turn-cost-chip`（MIT）。
> 两个脚本从 `GH_OWNER` / `GH_REPO` 环境变量读这两个值，也可以直接传 `-Owner` / `-Repo`。

---

## 开始之前：你现在缺的只有 GitHub 账号

精选目录**只索引 GitHub 仓库**（CI 会直接去仓库读 `package.json` 的 `dsh.bundle`），没有 GitHub 账号就没有 `url` 可填，任何一条路都走不通。注册这一步只能你本人做（要邮箱验证、可能有人机验证），大约 3 分钟：

1. 打开 <https://github.com/signup>，填邮箱、密码、用户名。
   - **用户名会直接成为 `dsh-plugin` 目录里的 owner**，也就是 `name: <OWNER>/<REPO>` 里的前半截，取一个好认的。
2. 收邮件点验证链接。
3. 登录后右上角头像 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**：
   - Expiration：7 天足够（上架完就不用它了）；
   - Repository access：**All repositories**（建仓库和后续 fork 都要用）；
   - Permissions → Repository permissions：**Contents: Read and write**、**Pull requests: Read and write**；
   - 生成后**只显示一次**，复制下来。
4. 把 token 存成一个**工作区之外**的一行文本文件，例如 `C:\Users\39732\.dsh\gh-token.txt`（别放进 `dsh-turn-cost/` 目录，那个目录会被整体上传）。
5. 注册完告诉我你的 **GitHub 用户名** 和想用的 **仓库名**（建议 `dsh-turn-cost-chip`），剩下的脚本我来跑。

> 注册之前/之后都能先分发：`dist\dsh-turn-cost-chip-1.0.0.tgz` 已经打好了，对方执行
> `dsh plugin --profile desktop add .\dsh-turn-cost-chip-1.0.0.tgz` 即可安装——不需要任何账号、不需要市场。

## 0. 三条路，先看清各自要什么

| 形态 | 别人怎么装 | 需要什么 | 适合 |
|---|---|---|---|
| **GitHub 仓库直装** | `dsh plugin --profile desktop add github:<OWNER>/<REPO>` | 一个公开仓库（本插件没有构建脚本，装下来就能跑） | 先发给朋友内测 |
| **目录收录（=「上架市场」）** | 在插件页的「插件市场」里搜到并点安装 | 上面那条 + 提一个 PR | 正式上架 |
| **npm 包** | `dsh plugin add <包名>` | npm 账号 | 可选，只影响下载量数字 |

三条可以叠加。**只有第二条算「上架」。** npm 不是必需的：本插件是纯 JS，没有 `prepare` 脚本，从 GitHub 装不需要构建授权。

## 1. 目录的硬性要求（会被 CI 自动检查）

1. 仓库 `package.json` 里声明 **`dsh.bundle`**（只声明 `dsh.client` 会被拒）——本插件已有 `dsh.bundle.patch`。
2. 仓库里是**真实可用的代码**，不是占位/空壳。
3. 仓库**创建满 1 天**才能过 CI（差几小时就先等，到点会自动重跑，不用推空提交）。
4. 给仓库加 **`dsh-plugin`** 这个 topic（仓库首页 → About 右侧齿轮 → Topics）。
5. PR **只加一个文件**：`data/plugins/<OWNER>__<REPO>.yml`；一个 PR 最多 3 条。
6. 描述**必须属实**、不带营销词——维护者会读你的代码逐条核对。

## 2. 上架前要改的四处（都需要知道你的名字/仓库名）

- `package.json`：去掉 `"private": true`（只在发 npm 时需要；GitHub 直装不影响，但去掉更干净），补 `repository`、`homepage`、`author`、`license`、`keywords`。
- 仓库根加 `LICENSE`（建议 MIT，写上你的署名年份）。
- README 里加一句安装方式（`dsh plugin --profile desktop add github:<OWNER>/<REPO>`）。
- 可选 `screenshots.json`（1–8 张 **GitHub 托管的位图**，市场详情页会按 App Store 式轮播）：刷新页面后截两张——一张「每条回复末尾的读数」，一张「输入框下方的累计」。

> ⚠️ 目录条目的 `icon:` 只收 **GitHub 托管的 png/jpg/jpeg/webp**，不收 SVG（不写就回退到你的 GitHub 头像）。插件包内自带的 `icon.svg` 是给插件管理器用的，两者不是一回事。

## 3. 提交用的 yml（照抄，改占位符）

文件名：`data/plugins/<OWNER>__<REPO>.yml`

```yaml
url: https://github.com/<OWNER>/<REPO>
name: <OWNER>/<REPO>
category: usage
description:
  en: Shows each completed reply's cost in CNY as a chip inside the conversation, plus the conversation total in the composer dock, priced from DeepSeek list prices with the peak and off-peak band. It reads only token usage the Session already recorded, sends no extra request, and exposes the same breakdown to screen readers.
  zh: 在每条完成的回复末尾显示这一轮的人民币花费，并在输入框下方显示本次会话累计；按 DeepSeek 官方刊例价与高峰/空闲时段计价。只读取会话里已记录的 token 用量，不发额外请求，并把同样的明细提供给读屏软件。
```

字段说明（按目录的真实 schema）：只有 `description.en` 必填；`category` 从固定集合里选，本插件选 `usage`（用量与计费）；`zh` 可选但建议写。描述里如果出现 `: `（冒号+空格）必须整行加引号。

**别在 yml 里写 `npm:` 字段**（会被校验拒绝，npm 关联是自动采集的）。如果以后发了 npm 包，要求是：包里 `repository` 字段指回这个仓库。

## 4. 提交步骤（这台机器没有 git，所以给两条路）

### 4A. 用 GitHub 网页（最稳，推荐第一次用）

1. 新建仓库：<https://github.com/new>，README / .gitignore / license 都不勾。
2. 在仓库页 **Add file → Upload files**，把 `dsh-turn-cost/` 里的全部文件拖进去（保留目录结构），提交。
3. About 右侧齿轮 → Topics 加 `dsh-plugin`。
4. 等满 1 天。
5. fork <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>，在**你自己的 fork** 里 **Add file → Create new file**，路径填 `data/plugins/<OWNER>__<REPO>.yml`，粘贴上一节内容，提交。
6. 回到原仓库点 **Compare & pull request**，标题写 `Add <OWNER>/<REPO>`，正文一句说明插件做什么即可。
7. CI 绿了等维护者合并；需要改时他们会给 PR 打 `held: author` 标签，把修改推同一分支并留一条评论说明即可。

### 4B. 用 GitHub API 脚本（这台机器没有 git，但 `api.github.com` 可达）

已经写好两个脚本，都在 `publish/`：

| 脚本 | 作用 | 什么时候跑 |
|---|---|---|
| `publish\publish-github.ps1` | 建公开仓库 → 逐个上传文件 → 加 `dsh-plugin` topic（幂等，可重跑） | token 准备好之后 |
| `publish\submit-catalog.ps1` | 检查仓库年龄 → fork 精选目录 → 写条目 yml → 开 PR | 仓库满 24 小时后 |

token 从文件读，不进对话、不进仓库。**这台机器的 PowerShell 默认禁止运行 `.ps1`**，所以要么用 `-ExecutionPolicy Bypass`，要么直接把内容当脚本块执行：

```powershell
$env:GH_OWNER = '<OWNER>'
$env:GH_REPO  = '<REPO>'

# 方式一
powershell -ExecutionPolicy Bypass -File .\publish\publish-github.ps1 -TokenFile "$env:USERPROFILE\.dsh\gh-token.txt"

# 方式二（在你已经开着的 PowerShell 里）
$sb = [ScriptBlock]::Create((Get-Content .\publish\publish-github.ps1 -Raw -Encoding UTF8))
& $sb -TokenFile "$env:USERPROFILE\.dsh\gh-token.txt" -PackageRoot (Get-Location).Path

# 满 24 小时后同样方式跑 submit-catalog.ps1
powershell -ExecutionPolicy Bypass -File .\publish\submit-catalog.ps1 -TokenFile "$env:USERPROFILE\.dsh\gh-token.txt"
```

`publish\` 目录会一并同步到仓库里（没坏处，别人也能看到发布流程）；但 `-TokenFile` 指向的文件**必须放在插件目录之外**，否则会被上传。想先看脚本要做什么，加 `-DryRun`（不联网）。

`submit-catalog.ps1` 里的条目内容来自 `publish\catalog-entry.yml`（按目录真实 schema 写好的，`__OWNER__` 之类会被自动替换）。想先看它会做什么，加 `-DryRun`。

如果你把用户名和仓库名告诉我、并把 token 存到那个文件，这两步我可以直接替你跑完；token 我只会用来调这两次 GitHub API。

## 5. 可选：不上架也能让别人一键装（自有索引源）

DSH 官方文档给的路子是**你自己发一份索引 JSON**，别人在 插件 → 发现 → 添加索引源 里填你的 URL（`dsh-plugin-bundle-market` 那个实验性组合包要先打开）。放 GitHub Pages / 对象存储都行：

```json
{
  "format": 1,
  "title": { "en": "My plugins", "zh": "我的插件" },
  "plugins": [
    {
      "name": "<OWNER>/<REPO>",
      "title": { "en": "Turn cost", "zh": "对话费用" },
      "description": { "en": "Per-reply and per-conversation CNY cost.", "zh": "每轮与整段会话的人民币花费。" },
      "author": "<你的名字>",
      "homepage": "https://github.com/<OWNER>/<REPO>#readme",
      "repository": { "url": "https://github.com/<OWNER>/<REPO>" },
      "versions": [
        {
          "version": "1.0.0",
          "publishTimestamp": 1794790000,
          "source": { "type": "git", "url": "https://github.com/<OWNER>/<REPO>", "commit": "<40 位 commit SHA>" },
          "engines": { "dsh": ">=0.2.0-0 <0.3.0-0" }
        }
      ]
    }
  ]
}
```

`publishTimestamp` 是 Unix 秒；Git 源要写满 40 位 commit SHA（先用 API 查 `GET /repos/<OWNER>/<REPO>/commits/main`）。

## 6. 命名：`dsh-turn-cost` 在 npm 上已经被占了

| 名字 | 状态 |
|---|---|
| `dsh-turn-cost` | ❌ 已被占（0.6.2，功能几乎相同） |
| `dsh-cost-badge` | ❌ 已被占（1.0.0，峰谷倒计时+消费统计） |
| `dsh-cost-chip` / `dsh-cost-meter` | ❌ 已被占 |
| `dsh-rmb-cost` | ✅ 可用 |
| `dsh-turn-cost-chip` | ✅ 可用 |
| `@<你的 npm 用户名>/dsh-turn-cost` | ✅ 推荐（目录里多数插件都是带作用域的） |

GitHub 仓库名不受 npm 限制，但也别叫 `dsh-turn-cost`，避免和已有的那个混淆——建议 `dsh-turn-cost-chip` 或 `dsh-reply-cost`。

## 7. 预期管理：同类已经有好几个了

社区目录 `usage` 分类里已收录至少这些同类：`Angelyeye/dsh-cost-tracker`（人民币、峰谷计价、面板+工具+API）、`BeckChiang/dsh-cost-meter`、`Arun1016/dsh-cost`、`Avenger233/dsh-session-cost-board`、`2006spy/dsh-token-billing` 等；npm 上还有 `dsh-turn-cost` 与 `dsh-cost-badge`。

目录的规则是「两个插件做同一件事时，谁更好谁在」，不是先来后到。本插件能拿出来的差异只有这三条，描述里也应当只写这三条：

1. 读数**长在对话流里**：每条完成的回复末尾一行，不是另开面板/Tab；
2. 会话累计放在**输入框下方**、和宿主自带的轮次/用量胶囊同一行；
3. **零副作用**：不发请求、不写日志、不加工具；明细同时给读屏软件。

维护者仍可能判断「已被现有条目覆盖」而拒。如果被拒，正确做法是把上面三点补进实现（或合并到一个更明显的缺口上）再提交，而不是反复重开 PR。

## 8. 发布前自检清单

- [ ] `package.json` 有 `dsh.bundle.patch`，且 `cordis.patch.yml` 在仓库根
- [ ] 仓库公开、加了 `dsh-plugin` topic、创建满 1 天
- [ ] 别人能装：`dsh plugin --profile desktop add github:<OWNER>/<REPO>`，刷新后两处读数都在
- [ ] yml 里 `url` 与仓库完全一致，描述只是功能陈述、没有「最强/唯一」这类词
- [ ] PR 只新增那一个 yml，没有顺手改别人的条目
- [ ] 本地没有把 token、profile 路径、隐私截图提交上去

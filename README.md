# 风格资产库 · Style Asset Library

图像风格 / 提示词的可检索画册。纯静态站点，直接托管在 GitHub Pages，无后端、无构建依赖。

在线地址：`https://yijueyijue.github.io/style-asset-library/`

> 当前数据：92 条风格 / 101 张示例图 / 40 个分类（`scripts/validate.py` 实时校验通过）。分类统一采用 `大类——子分类` 两级（如 `摄影——电影感`、`插画——古风仙侠`、`二次元——游戏角色`），展厅页面默认铺满全部、分类仅作标签。
> 本文件是唯一权威 schema 与协作契约——其它 AI 或协作者按此文档增删字段、新增风格即可，无需额外说明。

## 目录结构

```
index.html            # 页面骨架 + 样式（~26 KB）
app.js                # 全部交互逻辑
data/styles.json      # 唯一数据源：每条风格一个对象
data/i18n.txt         # 中英对照 / 补充说明覆盖层（按提示词内容挂载，不按 id）
assets/full/A001.webp # 详情大图
assets/thumb/A001.webp# 列表缩略图（520px）
scripts/import_xlsx.py       # 【常用】图片 zip + 表格 xlsx → 一步入库
scripts/ingest.py            # 批量导入底层（多图 / 去重 / 自动压图）
scripts/add_style.py         # 单条新增
scripts/merge_i18n.py        # 中英对照体检 / 合并进 styles.json
scripts/validate.py          # 数据体检，CI 会跑
scripts/build_standalone.py  # 导出离线单文件版
.github/workflows/pages.yml  # push 到 main 自动部署
```

## 数据格式

```json
{
  "id": "A117",
  "seq": "117",
  "title": "默片拼贴海报",
  "category": "海报排版——模板",
  "kind": "海报",
  "tone": "默片、拼贴、高对比",
  "palette": "纸白 / 钴蓝",
  "model": "Midjourney",
  "tags": ["海报", "拼贴", "竖图"],
  "aspect": "竖图",
  "updated": "2026.08.22",
  "prompt": "完整提示词原文",
  "zh": "英文提示词对应的中文译文（也可交给 data/i18n.txt 提供）",
  "note": "参数 / 适用场景 / 来源等补充说明，不属于提示词正文",
  "img": "assets/full/A117.webp",
  "thumb": "assets/thumb/A117.webp",
  "w": 900,
  "h": 1200,
  "shots": [
    { "img": "assets/full/A117.webp",   "thumb": "assets/thumb/A117.webp",   "w": 900, "h": 1200 },
    { "img": "assets/full/A117-2.webp", "thumb": "assets/thumb/A117-2.webp", "w": 900, "h": 450 }
  ]
}
```

**字段含义（每一条风格对象）：**

| 字段 | 含义 | 必填 | 说明 / 用途 |
| --- | --- | --- | --- |
| `id` | 唯一编号 | ✅ | 形如 `A012`，`scripts/*` 自动递增；**只增不复用**（删了也不回收） |
| `seq` | 纯数字序号 | | `"012"`，用于排序 |
| `title` | 标题 | ✅ | 列表卡片与看片台标题 |
| `category` | 分类 | ✅ | 用 `——` 分段，前半段即 `kind`（如 `摄影——日系胶片`） |
| `kind` | 大类 | | 通常 = `category` 的 `——` 前半段，用作顶层分组 |
| `tone` | 基调描述 | | 一句话风格气质，如「默片、拼贴、高对比」 |
| `palette` | 配色 | | 主色十六进制，缺省由脚本取图片主色 |
| `model` | 生图模型 | | `Midjourney` / `GPT-Image` / `通用` 等 |
| `tags` | 标签 | | 数组，用于检索与筛选 |
| `aspect` | 版式 | | `横图` / `竖图` / `方图`，脚本按宽高比自动判定 |
| `updated` | 更新日期 | | `YYYY.MM.DD` |
| `prompt` | 提示词原文 | ✅ | **原文照拄不改写**；看片台全文展示，一键复制。**里面不允许混入备注/说明** |
| `zh` | 中文译文 | | 英文 `prompt` 对应的中文；有它看片台就出「原文 / 中文译文」页签 |
| `en` | 英文译文 | | 中文 `prompt` 对应的英文，与 `zh` 对称 |
| `note` | 补充说明 | | 参数 / 适用场景 / 来源；**不属于提示词**，看片台单独一栏，复制提示词时不带它 |
| `img` | 详情大图路径 | ✅ | `assets/full/A012.webp` |
| `thumb` | 缩略图路径 | ✅ | `assets/thumb/A012.webp` |
| `w` / `h` | 大图宽高 | | 像素 |
| `shots[]` | 多张示例图 | | 第二条起文件名 `A012-2.webp`；`shots[0]` = 封面 |
| `srcHash` | 来源图 sha1 | | 去重用，重复导入自动跳过 |
| `needsPrompt` | 待补提示词 | | `true` 表示还没填 `prompt` |

> 必填字段（`id` `title` `category` `prompt` `img` `thumb`）由 `scripts/validate.py` 强制校验，缺一个 CI 即报错；其余缺省时脚本会补默认值。
> `zh` / `en` / `note` 三个字段可以不写在 `styles.json` 里，改放 `data/i18n.txt`（见下一节），前端会在运行时合并。

图片与仓库路径的对应关系是固定的：**`assets/full/<id>.webp` 是详情大图，`assets/thumb/<id>.webp` 是列表缩略图**，一条风格挂多图时第 N 张为 `assets/full/<id>-N.webp`。这些文件由 `add_style.py` / `ingest.py` 自动从源图压图生成（详情图长边 ≤1400px、缩略图 520px），**不要手改图片文件名**。

规则：**id 只增不复用**（删了也不回收）；图片文件名 = id；提示词原文照拄，不改写。

**一条风格可以挂多张示例图**：`shots[]` 按顺序存，`shots[0]` 就是封面（与顶层 `img/thumb/w/h` 一致），
第二张起文件名为 `A117-2.webp`。列表卡片会显示「N 图」角标，看片台底部出现示例图切换条。

## 中英对照与补充说明：`data/i18n.txt`

译文和补充说明是人写的，不能因为重新 ingest、换 id、改标题就被冲掉。所以它们单独放在一个纯文本覆盖层里，
**按「提示词内容」挂载，不按 `id`**。前端会 `fetch data/i18n.txt` 并在运行时合并，所以**不跑任何脚本、直接改这个文件推上去就生效**。

块格式（`## ` 开头单独一行，正文一直到下一个 `## ` 或文件尾）：

```
## 1vo2tdw note
生成这个场景结合的远景图，大场景……

## 15m28b4 zh
一张清晰的人像照……
```

- `field` 只有三种：`zh`（中文译文）、`en`（英文译文）、`note`（补充说明）。
- `key` = `fnv1a32(提示词去标点后转小写的前 120 字)` 的 base36，算法在 `app.js` 的 `i18nKey()` 与 `scripts/merge_i18n.py` 的 `i18n_key()` 里，**两边必须同步修改**。
- 算一段提示词的 key：`python3 scripts/merge_i18n.py --key "提示词全文"`。
- 四条规矩：正文任何一行都不能以 `## ` 开头；只翻译不改写（参数、权重、`--ar` 之类原样保留）；只有 `zh`/`en` 会进中英切换，`note` 永远单独一栏；key 对不上就静静降级（网页照常显示原文）。

体检与合并：

```bash
python3 scripts/merge_i18n.py --check         # 谁命中、谁还缺译文（直接给出可拷贝的块头）
python3 scripts/merge_i18n.py --check --all   # 不截断，列全部缺口
python3 scripts/merge_i18n.py                 # 把 zh / en / note 固化进 data/styles.json
```

合并只在做离线单文件构建、或想把译文沉进主数据时才需要；日常维护用 `--check` 就够了。合并后记得跑 `scripts/validate.py` 再推。

### 新增批次的必做清单（照着走，别漏）

每次并一批新数据（无论谁经手），按以下顺序收尾，三条硬约束全满足再 `git push`：

1. **先 `git pull` 拉线上最新**（含其他协作者/AI 的优化），再合并，避免覆盖他人成果。
2. **入库**：`import_xlsx.py`（注意本机 safe-delete 坑，见上）或独立内存脚本；`scripts/validate.py` 通过。
3. **分类细分**：逐条通读提示词，按内容落到 `大类——子分类`；禁止整批塞一个大类名（硬约束见「浏览与筛选」）。
4. **补 i18n 译文**：`python3 scripts/merge_i18n.py --check --all` 找出外文原版缺口，在 `data/i18n.txt` 补 `zh` 块至全覆盖。
5. **推送**：`git push` → Actions 自动部署，约 1 分钟后线上生效；上线后核对 `count` / `cats` 数与本地一致。

## 提示词怎么展示 / 协作契约

画廊页面点击任意卡片会弹出「看片台」模态框。看片台里一共三块内容，**彼此独立、不拼接**：

| 区域 | 内容 | 复制按钮 |
| --- | --- | --- |
| 原文 / 中文译文页签 | `prompt` 与 `zh`（或 `en`），只有一种语言时不显示页签 | 右上「复制」，**跟随当前页签** |
| `#mPrompt` | 当前页签的提示词正文，**仅此而已** | 同上 |
| 补充说明 | `note`，带「不属于提示词正文」标注，没有就整栏隐藏 | 自己独立的复制按钮 |

所以：

- **`prompt` 就是协作交付物**：原文照拄、不改写、不翻译、不省略占位符（`*`、`_`、`{节点名}` 等）。
- **`note` 是说明文字，不是提示词**：录入时就要分开存，展示时分开显，复制提示词时绝不带它。
- **英文提示词必须配中文译文**（`zh`），中文的可配 `en`，两边都能切；译文只供阅读，拿去生图请用原文。
  **协作硬约束（由另一个 AI 定为站点规范）**：任何批次入库了英文/外文原版提示词，都必须同步在 `data/i18n.txt` 挂对应的 `zh` 块，
  否则看片台的「中文译文」页签会为空。入库后务必跑 `python3 scripts/merge_i18n.py --check --all` 核对缺口，
  把缺的译文块补完再推（见下方「新增批次的必做清单」）。
- 数据全在 `data/styles.json` + `data/i18n.txt` 两个文件里，本 README 即 schema 权威文档；其它 AI 或人按上面「字段含义」增删字段、跑 `scripts/validate.py` 校验、再 `git push` 即可。

看片台的五条硬规定（改样式 / 改交互时别破坏，破坏了就是「点进去看不到提示词」）：

1. **提示词与补充说明分家**：`#mPrompt` 里永远只能是提示词。曾经的 `[prompt, note].join("———")` 拼接写法已废弃，
   它会让人把中文备注当成提示词一起复制走。补充说明走 `#mNoteWrap`，自带标题、分隔和独立复制按钮。
2. **中英切换**：有译文时才出 `#mLangTabs`（`原文 · EN` / `中文译文`），没译文就不出。
   当前页签跨风格保持（翻下一条不会跳回原文），`复制` 按钮必须跟随当前页签，快捷键 `L` 切换。
3. **排版**：提示词块紧跟在标题/按钮下面，规格卡片（Category / Model / Palette / Updated）排在最后；
   信息区 `.modalInfo` 自己可滚动（`overflow:auto` + `min-height:0`），窄屏下看片台是「上图下文」两段式、两行都用 `fr` 分高。
   切记不要把信息行改回 `auto`：`.modalCard` 是 `overflow:hidden`，`auto` 行会把提示词整块裁掉且滚不到。
4. **层级**：`#modal` / `#lightbox` / `#toast` 的 `z-index` 必须高于 `#canvas`。展厅是全屏浮层，模态框一旦低于它，点了等于没开。
   `app.js` 里的 `liftModalAboveCanvas()` 会在运行时兜底抬高，别把它删了。
5. **展厅的点击**：`#viewport` 调用了 `setPointerCapture`，浏览器会把随后的 `click` 重定向到 `#viewport` 本身，
   于是 `e.target.closest("[data-id]")` 永远拿不到展板。展厅的「点击看提示词」因此在 `pointerup` 里自行判定
   （记下 `pointerdown` 的原始目标 + 位移 ≤ 8px 才算点击），全局 click 委托对 `#canvas` 内直接跳过。

## 新增一条风格

**方式一（推荐）**：把图 + 提示词发给我，我直接提交。

**方式二**：在仓库开一个 Issue，选「新增风格」模板，填完就行。

**方式三**：本地命令行

```bash
pip install pillow
python3 scripts/add_style.py \\
  --image ~/Downloads/demo.png \\
  --title "默片拼贴海报" \\
  --category "海报排版——模板" \\
  --model "Midjourney" \\
  --tags "海报,拼贴" \\
  --prompt-file ./prompt.txt
python3 scripts/validate.py
git add -A && git commit -m "add: 默片拼贴海报" && git push
```

推送后 Actions 会自动构建并部署，约 1 分钟后线上生效。

## 浏览与筛选

分类只作用于**网格资产库**，是**两级**的，直接从 `category` 推导：`——` 前半段 = **大类**（`kind`，如 `摄影`），后半段 = **子分类**（如 `日系胶片`）。所以新增风格时写好 `category` 就自动入树，不用额外配置。

> **协作硬约束：分类必须细分，不能笼统塞一个大类。** 来源若是「单文件夹 / 单表」式混合素材（如一批 MJ 图按工作表名只给了一个「MJ风格及事例」大类），
> 必须**通读每条提示词、按内容拆到 `大类——子分类` 两级**，对齐库里既有条目（如 `摄影——电影感`、`插画——古风仙侠`、`二次元——游戏角色`）。
> **禁止把整批压在单一大类名下。** 没有合适大类时可新增（如本库新增的「场景」「风格参考」），但每条都要落到具体子分类。
> 展厅默认铺全部、分类仅作标签，细分不会让展厅变碎，只是让网格库可筛。

- **宽屏左侧栏**（`#catList`）：`全部资产` + 各大类；点大类即筛出该大类全部条目，并展开它下面的子分类。
- **窄屏顶部胶囊**（`#catChips`，≤1100px 出现）：`全部资产 › 大类 › 当前大类的子分类`，与侧栏共用同一个筛选状态。
- 筛选值共三种：`ALL`、`KIND:<大类>`（整个大类）、完整的 `category` 全名（单个子分类）。
- 默认仍然是**全部资产**；分类可与顶部搜索、「模型」筛选、「挑选夹」叠加使用。
- 搜索覆盖：标题 / 分类 / 风格 / 模型 / 标签 / 提示词全文 / **中英译文 / 补充说明**——所以搜中文也能命中英文提示词。
- 分类数与各类计数都是运行时从 `data/styles.json` 的 `assets` 现算的，新增/删除风格无需改任何前端代码。

**「无限画布」展厅不参与分类**：它永远铺全部资产（`list({ ignoreCat: true })`），不跟网格库的分类选择走，只受搜索 / 「模型」/「只看挑选」影响。
`#canvasChips` 保持隐藏（`.canvasChips{display:none}`），展厅里也不要再加分类切换。

## 本地预览

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

页面通过 `fetch` 读 `data/styles.json` 与 `data/i18n.txt`，所以**不能双击直接打开 index.html**（file:// 会被浏览器拦）。需要一个双击即开的版本就跑：

```bash
python3 scripts/merge_i18n.py                  # 先把译文固化进 styles.json
python3 scripts/build_standalone.py --thumbs   # 输出 dist/standalone-lite.html
```

## 图片规范

| 项 | 值 |
| --- | --- |
| 格式 | WebP |
| 详情图 | 长边 ≤ 1400px，建议 < 400 KB |
| 缩略图 | 长边 520px，< 120 KB，脚本自动生成 |
| 总体积 | 控制在 700 MB 以内（Pages 站点上限 1 GB） |

## 快捷键

`/` 搜索 · `←` `→` 换风格 · `↑` `↓` 换示例图 · `L` 切换原文/中文译文 · `F` 加入挑选 · `Esc` 关闭 · 地址栏 `#A007` 可直达单条风格

## 部署

仓库 Settings → Pages → Source 选 **GitHub Actions**，之后每次 push 到 `main` 自动上线。

## 批量入库：Notion 附件 zip + 表格 xlsx（常用）

这是目前库里真实数据的入库方式。把 Notion 里的表格导出为 `.xlsx`（带附件则得到一个 `.zip`），然后：

```bash
python3 scripts/import_xlsx.py --zip 附件.zip --xlsx 表格.xlsx --dry-run   # 先看匹配对不对
python3 scripts/import_xlsx.py --zip 附件.zip --xlsx 表格.xlsx             # 追加入库
python3 scripts/validate.py
python3 scripts/merge_i18n.py --check                                    # 英文提示词补中文对照
```

它做了三件事：

1. **图↔行对号**。Notion 导出的图片文件名就是提示词全文，但会把 `、` `/` `:` 换成 `_`，同名附件还会加 `(1)`。
   脚本把两边都去掉标点/空白后做全文精确比对（只比前几十字会把「同头不同尾的升级版」弄混），
   并对着表格里的附件个数逐行对账，对不上会直接报行号。
2. **提示词以 xlsx 为准**。文件名只用来认人，入库文本一律取表格单元格原文，不被字符替换污染。
3. **同一行多张图归为一条风格**，写成 `shots[]`；同时自动压图、取主调配色、sha1 去重。

列名是模糊匹配的：含「提示词 / 文本」= 提示词，含「效果 / 图片 / 参考」= 附件列，
含「**补充** / 备注 / 备註 / 注释 / 适用 / 说明 / remark / note」= 补充说明列。还认不出来就用 `--note-col 你的列名` 手动指定。
脚本会打印一行「列识别」和「带补充说明的行：N / M」，**导入后务必看一眼**：
早期版本只找「适用/说明/备注」三个词，而表头写的是「补充」，结果整列 `note` 静静丢掉了，一声不响。

补充说明入库后存在独立的 `note` 字段，**不会、也不得拼进 `prompt`**；说明里出现 GPT 则模型记为 `GPT-Image`。
分类默认用工作表名（`--category` 可改）。

标题会从「补充说明」自动提炼，不满意就用 `--titles titles.json`（`{\"1\": \"标题一\", \"2\": \"标题二\"}`，键是行号）覆盖。
首批清空重建加 `--reset`（会删光已有图片和数据，活干前先备份 `data/styles.json`）。

### 已知问题：本机 safe-delete 守卫会卡死 `import_xlsx.py`

`scripts/import_xlsx.py` 的 `unpack()` 在追加入库前会用 `shutil.rmtree` 清掉旧的 `incoming/` 临时目录。
本机 WorkBuddy 的 safe-delete 守卫对删除操作 **fail-closed**（误报路径、且超时拒绝任何删除），会直接让脚本**卡死**在 `rmtree` 这一步，无任何进度。

**绕开办法（已验证可用）**：不要跑 `import_xlsx.py`，改用独立内存脚本——直接读 zip 内容到内存、用 PIL 压 webp 直落 `assets/`，
**不先解包 225MB、不删任何目录**，从而绕开守卫。逻辑复刻 `ingest.py`（详情图长边 ≤1400/q82、缩略图 ≤520/q72、取主色、sha1 去重、`cats`/`hero` 重算）。
要点：

- 压图用 `PIL.Image.save(..., "WEBP", quality=82)`（full）与 `quality=72`（thumb）。
- 多图同一行 → 写成 `shots[]`（`A0XX-2.webp` 起）。
- 入库后跑 `scripts/validate.py` 与 `scripts/merge_i18n.py --check --all`，再 `git push`。

> 注：守卫是本机环境特性，非仓库问题；换一台没装该守卫的机器，`import_xlsx.py` 可正常跑。

## 换数据：文件夹 + prompts.md（备用方式）

没有表格、只有一堆图时用这个：

```bash
python3 scripts/ingest.py --dir incoming/imgs --prompts incoming/prompts.md --reset
python3 scripts/validate.py
```

`prompts.md` 每条一块，`##` 后面写图片文件名：

```markdown
## portrait-01.jpg
标题: 赛博东方肖像
分类: 生图风格
模型: Midjourney
标签: 人像, 霓虹
---
A cyberpunk oriental portrait, neon rim light, 85mm --ar 3:4 --v 6
```

只有图片和提示词必填；标题缺省用文件名，分类缺省进「未分类」，配色缺省自动取图片主色。
同一张图重复导入会自动去重；坏图、缺提示词只会跳过并告警，不会中断整批。

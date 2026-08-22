# 风格资产库 · Style Asset Library

图像风格 / 提示词的可检索画册。纯静态站点，直接托管在 GitHub Pages，无后端、无构建依赖。

在线地址：`https://<你的用户名>.github.io/style-library/`

## 目录结构

```
index.html            # 页面骨架 + 样式（~26 KB）
app.js                # 全部交互逻辑
data/styles.json      # 唯一数据源：每条风格一个对象
assets/full/A001.webp # 详情大图
assets/thumb/A001.webp# 列表缩略图（520px）
scripts/import_xlsx.py       # 【常用】图片 zip + 表格 xlsx → 一步入库
scripts/ingest.py            # 批量导入底层（多图 / 去重 / 自动压图）
scripts/add_style.py         # 单条新增
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
  "note": "参数、适用场景等补充说明",
  "prompt": "完整提示词原文",
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

规则：**id 只增不复用**（删了也不回收）；图片文件名 = id；提示词原文照拄，不改写。

**一条风格可以挂多张示例图**：`shots[]` 按顺序存，`shots[0]` 就是封面（与顶层 `img/thumb/w/h` 一致），
第二张起文件名为 `A117-2.webp`。列表卡片会显示「N 图」角标，看片台底部出现示例图切换条。

## 新增一条风格

**方式一（推荐）**：把图 + 提示词发给我，我直接提交。

**方式二**：在仓库开一个 Issue，选「新增风格」模板，填完就行。

**方式三**：本地命令行

```bash
pip install pillow
python3 scripts/add_style.py \
  --image ~/Downloads/demo.png \
  --title "默片拼贴海报" \
  --category "海报排版——模板" \
  --model "Midjourney" \
  --tags "海报,拼贴" \
  --prompt-file ./prompt.txt
python3 scripts/validate.py
git add -A && git commit -m "add: 默片拼贴海报" && git push
```

推送后 Actions 会自动构建并部署，约 1 分钟后线上生效。

## 本地预览

```bash
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

页面通过 `fetch` 读 `data/styles.json`，所以**不能双击直接打开 index.html**（file:// 会被浏览器拦）。需要一个双击即开的版本就跑：

```bash
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

`/` 搜索 · `←` `→` 换风格 · `↑` `↓` 换示例图 · `F` 加入挑选 · `Esc` 关闭 · 地址栏 `#A007` 可直达单条风格

## 部署

仓库 Settings → Pages → Source 选 **GitHub Actions**，之后每次 push 到 `main` 自动上线。

## 批量入库：Notion 附件 zip + 表格 xlsx（常用）

这是目前库里真实数据的入库方式。把 Notion 里的表格导出为 `.xlsx`（带附件则得到一个 `.zip`），然后：

```bash
python3 scripts/import_xlsx.py --zip 附件.zip --xlsx 表格.xlsx --dry-run   # 先看匹配对不对
python3 scripts/import_xlsx.py --zip 附件.zip --xlsx 表格.xlsx             # 追加入库
python3 scripts/validate.py
```

它做了三件事：

1. **图↔行对号**。Notion 导出的图片文件名就是提示词全文，但会把 `、` `/` `:` 换成 `_`，同名附件还会加 `(1)`。
   脚本把两边都去掉标点/空白后做全文精确比对（只比前几十字会把「同头不同尾的升级版」弄混），
   并对着表格里的附件个数逐行对账，对不上会直接报行号。
2. **提示词以 xlsx 为准**。文件名只用来认人，入库文本一律取表格单元格原文，不被字符替换污染。
3. **同一行多张图归为一条风格**，写成 `shots[]`；同时自动压图、取主调配色、sha1 去重。

列名是模糊匹配的：含「提示词」的列 = 提示词，含「效果/图片/参考」= 附件列，含「适用/说明/备注」= 说明。
分类默认用工作表名（`--category` 可改）；说明里出现 GPT 则模型记为 `GPT-Image`。

标题会从「适用说明」自动提炼，不满意就用 `--titles titles.json`（`{"1": "标题一", "2": "标题二"}`，键是行号）覆盖。
首批清空重建加 `--reset`（会删光已有图片和数据，活干前先备份 `data/styles.json`）。

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

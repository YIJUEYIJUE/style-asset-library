# 风格资产库 · Style Asset Library

图像风格与提示词的可检索展厅。纯静态，无后端，GitHub Pages 托管。

站点：https://yijueyijue.github.io/style-asset-library/

## 目录结构

```
index.html            页面骨架 + 全部样式
app.js                展厅 / 看片台 / 无限画布 / 挑选夹
data/styles.json      风格数据（标题、分类、提示词、图片路径）
assets/full/*.webp    大图（长边 ≤ 1400px，阈值 600 KB）
assets/thumb/*.webp   缩略图（长边 ≤ 520px，阈值 120 KB）
scripts/              入库与体检工具
.github/workflows/    推到 main 自动校验并部署
```

## 首次上线（三步）

1. 本地解压 `style-library.zip`
2. 本页 **Add file → Upload files**，把解压后的 `index.html`、`app.js`、`data`、`assets`、`scripts` 一次拖进来（可直接拖文件夹，目录层级会保留），提交
3. **Settings → Pages → Source** 选 **GitHub Actions**

Action 跑完（约 1–2 分钟）站点就活了。

> 图片只能用浏览器上传：GitHub 的 API 写文件接口只收文本，二进制图片转一道会损坏。以后每批新图同理：图你拖，提示词和数据我改。

## 三个看法

- **资产库**：网格列表 + 分类筛选 + 搜索
- **看片台**：点卡片进详情，纸感浅底，右侧提示词一键复制；再点图开灯箱看完整原图
- **无限画布**：球面展厅，拖拽旋转、滚轮缩放，适合一眼扫很多图

挑选夹存在浏览器本地（localStorage），不上传。

## 新增风格

批量（Excel + 图包）：

```bash
python3 scripts/import_xlsx.py --zip 附件.zip --xlsx 提示词.xlsx --category "海报排版——模板"
python3 scripts/validate.py
```

单条：

```bash
python3 scripts/ingest.py --dir ./新图 --prompts ./prompts.txt
```

两者都会自动压图、生缩略图、sha1 去重、写回 `data/styles.json`。不想命令行就开一个 Issue（模板“新增风格”）。

## 限制

Pages 站点 ≤ 1 GB，单文件 ≤ 100 MB，构建 10 次/小时。图片均为 WebP，超阈值 `scripts/validate.py` 会警告。

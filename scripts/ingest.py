#!/usr/bin/env python3
"""批量入库：图片 + 提示词 → 压图/缩略图 → 写入 data/styles.json

三种用法
--------
1) 首批真实数据（清掉占位内容再导入）
     python3 scripts/ingest.py --dir incoming/imgs --prompts incoming/prompts.md --reset
2) 之后每批追加
     python3 scripts/ingest.py --dir incoming/imgs2 --prompts incoming/prompts2.md
3) 用 JSON 清单（字段最全，适合我批量生成）
     python3 scripts/ingest.py --manifest incoming/batch1.json

prompts.md 格式（用 ## 图片文件名 分块）
----------------------------------------
## portrait-01.jpg
标题: 赛博东方肖像
分类: 生图风格
模型: Midjourney
标签: 人像, 霓虹
---
A cyberpunk oriental portrait, neon rim light, 85mm --ar 3:4 --v 6

## poster-02.png
标题: 石油感字体海报
分类: 海报排版
---
（提示词正文…）

规则
----
* 只有「图片」和「提示词正文」是必填；标题缺省用文件名，分类缺省用 --default-category。
* 同一张图（按文件内容哈希）重复导入会被跳过，不会产生重复条目。
* 单张图坏掉/格式不支持只会跳过并告警，不会中断整批。
* 手机照片会按 EXIF 自动转正；PNG 透明底会铺白。
* 未填「配色」时自动取图片主色（十六进制）填入。
"""
import argparse
import hashlib
import json
import re
import shutil
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
FULL = ROOT / "assets" / "full"
THUMB = ROOT / "assets" / "thumb"
MAX_FULL = 1400
MAX_THUMB = 520
Q_FULL = 82
Q_THUMB = 72
PENDING_PROMPT = "（待补提示词）"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif"}

KEYMAP = {
    "标题": "title", "title": "title",
    "分类": "category", "category": "category",
    "模型": "model", "model": "model",
    "标签": "tags", "tags": "tags",
    "配色": "palette", "palette": "palette",
    "备注": "note", "note": "note",
    "类型": "kind", "kind": "kind",
    "基调": "tone", "tone": "tone",
}


def parse_prompts_md(text):
    """把 ## 文件名 分块的 markdown 解析成 {文件名: {...}}。"""
    items = {}
    blocks = re.split(r"^#{2,3}\s+", text, flags=re.M)[1:]
    for b in blocks:
        lines = b.splitlines()
        if not lines:
            continue
        fname = lines[0].strip().strip("`")
        meta, body, in_body = {}, [], False
        for ln in lines[1:]:
            if not in_body:
                if ln.strip() in ("---", "***", ""):
                    if ln.strip() in ("---", "***"):
                        in_body = True
                        continue
                    if meta:
                        in_body = True
                        continue
                    continue
                m = re.match(r"^\s*([\u4e00-\u9fa5A-Za-z_]+)\s*[:：]\s*(.+?)\s*$", ln)
                if m and m.group(1) in KEYMAP:
                    meta[KEYMAP[m.group(1)]] = m.group(2)
                    continue
                in_body = True
            body.append(ln)
        item = dict(meta)
        item["prompt"] = "\n".join(body).strip()
        items[fname] = item
    return items


def dominant_palette(im, k=3):
    small = im.copy()
    small.thumbnail((80, 80), Image.LANCZOS)
    q = small.quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette() or []
    counts = sorted(q.getcolors() or [], reverse=True)[:k]
    out = []
    for _, idx in counts:
        r, g, b = pal[idx * 3: idx * 3 + 3] or (0, 0, 0)
        out.append(f"#{r:02X}{g:02X}{b:02X}")
    return " / ".join(out)


def sha1_file(p):
    h = hashlib.sha1()
    h.update(Path(p).read_bytes())
    return h.hexdigest()[:16]


def reset_library(payload):
    for d in (FULL, THUMB):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)
    payload["assets"] = []
    payload["cats"] = []
    payload["hero"] = []
    print("· 已清空旧资产（图片 + 数据）")


def collect(args):
    """返回 [{image, title, category, model, tags, prompt, ...}]"""
    out = []
    if args.manifest:
        raw = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        out = raw["items"] if isinstance(raw, dict) else raw
        base = Path(args.manifest).resolve().parent
        for it in out:
            raw = it.get("images") or ([it["image"]] if it.get("image") else [])
            fixed = []
            for s in raw:
                q = Path(s)
                fixed.append(str(q if q.is_absolute() or q.exists() else base / q))
            it["images"] = fixed
        return out

    meta = {}
    if args.prompts:
        meta = parse_prompts_md(Path(args.prompts).read_text(encoding="utf-8"))
    files = sorted(p for p in Path(args.dir).iterdir() if p.suffix.lower() in EXTS)
    for p in files:
        m = dict(meta.get(p.name) or meta.get(p.stem) or {})
        m["images"] = [str(p)]
        out.append(m)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", help="图片文件夹")
    ap.add_argument("--prompts", help="prompts.md（按 ## 文件名 分块）")
    ap.add_argument("--manifest", help="JSON 清单")
    ap.add_argument("--reset", action="store_true", help="导入前清空全部旧资产")
    ap.add_argument("--default-category", default="未分类")
    ap.add_argument("--default-model", default="通用")
    ap.add_argument("--allow-missing-prompt", action="store_true")
    args = ap.parse_args()
    if not args.manifest and not args.dir:
        raise SystemExit("需要 --dir 或 --manifest")

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    if args.reset:
        reset_library(payload)
    assets = payload["assets"]
    old_tones = {c["name"]: c.get("tone", "") for c in payload.get("cats", [])}
    seen_hash = {a.get("srcHash") for a in assets if a.get("srcHash")}
    nums = [int(re.sub(r"\D", "", a["id"]) or 0) for a in assets]
    n = max(nums, default=0)

    FULL.mkdir(parents=True, exist_ok=True)
    THUMB.mkdir(parents=True, exist_ok=True)

    added, skipped, failed = 0, [], []
    for it in collect(args):
        raw_srcs = it.get("images") or ([it["image"]] if it.get("image") else [])
        srcs = []
        for s in raw_srcs:
            q = Path(s)
            if q.exists():
                srcs.append(q)
            else:
                failed.append(f"{q.name}：文件不存在")
        if not srcs:
            continue
        label = srcs[0].name
        prompt = (it.get("prompt") or "").strip()
        if not prompt:
            if not args.allow_missing_prompt:
                failed.append(f"{label}：没有对应提示词（用 --allow-missing-prompt 可强行入库）")
                continue
            prompt = PENDING_PROMPT  # 占位，保证数据体检不报错
        digest = sha1_file(srcs[0])
        if digest in seen_hash:
            skipped.append(label)
            continue

        loaded = []
        for q in srcs:
            try:
                im = Image.open(q)
                im = ImageOps.exif_transpose(im)
                if im.mode in ("RGBA", "LA", "P"):
                    im = im.convert("RGBA")
                    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
                    im = Image.alpha_composite(bg, im).convert("RGB")
                else:
                    im = im.convert("RGB")
                loaded.append((q, im))
            except Exception as e:  # 单张坏图不拖垮整条
                failed.append(f"{q.name}：无法读取（{type(e).__name__}）")
        if not loaded:
            continue

        n += 1
        aid, seq = f"A{n:03d}", f"{n:03d}"
        im = loaded[0][1]
        shots = []
        for k, (q, src_im) in enumerate(loaded, 1):
            stem = aid if k == 1 else f"{aid}-{k}"
            full = src_im.copy()
            full.thumbnail((MAX_FULL, MAX_FULL), Image.LANCZOS)
            full.save(FULL / f"{stem}.webp", "WEBP", quality=Q_FULL, method=6)
            th = src_im.copy()
            th.thumbnail((MAX_THUMB, MAX_THUMB), Image.LANCZOS)
            th.save(THUMB / f"{stem}.webp", "WEBP", quality=Q_THUMB, method=6)
            shots.append({
                "img": f"assets/full/{stem}.webp",
                "thumb": f"assets/thumb/{stem}.webp",
                "w": full.width,
                "h": full.height,
            })
            seen_hash.add(sha1_file(q))

        tags = it.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in re.split(r"[,，、]", tags) if t.strip()]
        category = (it.get("category") or args.default_category).strip()
        ratio = shots[0]["w"] / shots[0]["h"]
        assets.append({
            "id": aid,
            "seq": seq,
            "title": (it.get("title") or src.stem).strip(),
            "category": category,
            "kind": (it.get("kind") or (tags[0] if tags else category)),
            "tone": it.get("tone", ""),
            "palette": it.get("palette") or dominant_palette(im),
            "model": (it.get("model") or args.default_model).strip(),
            "tags": tags or [category],
            "aspect": "方图" if 0.9 <= ratio <= 1.1 else ("横图" if ratio > 1 else "竖图"),
            "hot": int(it.get("hot", 60)),
            "updated": date.today().strftime("%Y.%m.%d"),
            "note": it.get("note", ""),
            "prompt": prompt,
            "img": shots[0]["img"],
            "thumb": shots[0]["thumb"],
            "w": shots[0]["w"],
            "h": shots[0]["h"],
            "shots": shots,
            "srcHash": digest,
            "needsPrompt": prompt == PENDING_PROMPT,
        })
        seen_hash.add(digest)
        added += 1

    # 分类只保留真实存在的，顺序按数量
    counts = {}
    for a in assets:
        counts[a["category"]] = counts.get(a["category"], 0) + 1
    payload["cats"] = [
        {"name": k, "tone": old_tones.get(k, "") or "COLLECTION", "count": v}
        for k, v in sorted(counts.items(), key=lambda kv: -kv[1])
    ]
    # 封面展示位：横图优先，最多 6 个
    wide = [a["id"] for a in assets if a.get("aspect") == "横图"]
    payload["hero"] = (wide or [a["id"] for a in assets])[:6]
    payload["count"] = len(assets)

    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"✓ 新增 {added} 条，库内共 {len(assets)} 条，分类 {len(payload['cats'])} 个")
    if skipped:
        print(f"· 跳过重复图 {len(skipped)} 张：{', '.join(skipped[:6])}{' …' if len(skipped) > 6 else ''}")
    for f in failed:
        print("! " + f)


if __name__ == "__main__":
    main()

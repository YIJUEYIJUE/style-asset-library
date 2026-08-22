#!/usr/bin/env python3
"""新增一条风格：压图 + 生成缩略图 + 写入 data/styles.json。

用法:
  python3 scripts/add_style.py \\
    --image ~/Downloads/demo.png \\
    --title "默片拼贴海报" \\
    --category "海报排版——模板" \\
    --model "Midjourney" \\
    --prompt-file ./prompt.txt \\
    --tags "海报,拼贴,竖图"
"""
import argparse
import json
import re
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
FULL = ROOT / "assets" / "full"
THUMB = ROOT / "assets" / "thumb"
MAX_FULL = 1400
MAX_THUMB = 520


def next_id(assets):
    nums = [int(re.sub(r"\D", "", a["id"]) or 0) for a in assets]
    n = max(nums, default=0) + 1
    return f"A{n:03d}", f"{n:03d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--category", required=True)
    ap.add_argument("--model", default="通用")
    ap.add_argument("--kind", default="")
    ap.add_argument("--tone", default="")
    ap.add_argument("--palette", default="")
    ap.add_argument("--tags", default="")
    ap.add_argument("--note", default="")
    ap.add_argument("--prompt", default="")
    ap.add_argument("--prompt-file", default="")
    args = ap.parse_args()

    prompt = args.prompt
    if args.prompt_file:
        prompt = Path(args.prompt_file).read_text(encoding="utf-8").strip()
    if not prompt:
        raise SystemExit("需要 --prompt 或 --prompt-file")

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    assets = payload["assets"]
    aid, seq = next_id(assets)

    FULL.mkdir(parents=True, exist_ok=True)
    THUMB.mkdir(parents=True, exist_ok=True)
    im = Image.open(args.image).convert("RGB")
    full = im.copy()
    full.thumbnail((MAX_FULL, MAX_FULL), Image.LANCZOS)
    full.save(FULL / f"{aid}.webp", "WEBP", quality=82, method=6)
    th = im.copy()
    th.thumbnail((MAX_THUMB, MAX_THUMB), Image.LANCZOS)
    th.save(THUMB / f"{aid}.webp", "WEBP", quality=72, method=6)

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    aspect = "方图" if 0.9 <= full.width / full.height <= 1.1 else ("横图" if full.width > full.height else "竖图")
    assets.append(
        {
            "id": aid,
            "seq": seq,
            "title": args.title,
            "category": args.category,
            "kind": args.kind or (tags[0] if tags else args.category),
            "tone": args.tone,
            "palette": args.palette,
            "model": args.model,
            "tags": tags or [args.category],
            "aspect": aspect,
            "hot": 60,
            "updated": date.today().strftime("%Y.%m.%d"),
            "note": args.note,
            "prompt": prompt,
            "img": f"assets/full/{aid}.webp",
            "thumb": f"assets/thumb/{aid}.webp",
            "w": full.width,
            "h": full.height,
        }
    )

    counts = {}
    for a in assets:
        counts[a["category"]] = counts.get(a["category"], 0) + 1
    known = {c["name"] for c in payload["cats"]}
    for c in payload["cats"]:
        c["count"] = counts.get(c["name"], 0)
    if args.category not in known:
        payload["cats"].append({"name": args.category, "tone": "NEW CATEGORY", "count": counts[args.category]})
    payload["count"] = len(assets)

    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ 已添加 {aid} 「{args.title}」（共 {len(assets)} 条）")


if __name__ == "__main__":
    main()

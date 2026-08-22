#!/usr/bin/env python3
"""导出离线单文件版（发微信 / 双击即开，无需服务器）。

  python3 scripts/build_standalone.py            # 图片也内嵌（体积大，但完全离线）
  python3 scripts/build_standalone.py --thumbs   # 只内嵌缩略图，体积小很多
"""
import argparse
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

ap = argparse.ArgumentParser()
ap.add_argument("--thumbs", action="store_true", help="详情图也用缩略图，体积更小")
args = ap.parse_args()

html = (ROOT / "index.html").read_text(encoding="utf-8")
app = (ROOT / "app.js").read_text(encoding="utf-8")
data = json.loads((ROOT / "data" / "styles.json").read_text(encoding="utf-8"))

cache = {}


def uri(rel: str) -> str:
    if rel not in cache:
        cache[rel] = "data:image/webp;base64," + base64.b64encode((ROOT / rel).read_bytes()).decode()
    return cache[rel]


for a in data["assets"]:
    a["thumb"] = uri(a["thumb"])
    a["img"] = a["thumb"] if args.thumbs else uri(a["img"])
    for shot in a.get("shots") or []:          # 一条风格的每张示例图都要内嵌
        shot["thumb"] = uri(shot["thumb"])
        shot["img"] = shot["thumb"] if args.thumbs else uri(shot["img"])

inline = '<script type="application/json" id="data">' + json.dumps(data, ensure_ascii=False) + "</script>"
html = html.replace('<script src="app.js" defer></script>', inline + "\n<script>" + app + "</script>")
html = re.sub(r'<div class="bootMsg" id="boot">.*?</div>', '<div class="bootMsg hide" id="boot"></div>', html, flags=re.S)

DIST.mkdir(exist_ok=True)
out = DIST / ("standalone-lite.html" if args.thumbs else "standalone.html")
out.write_text(html, encoding="utf-8")
print(f"✓ {out.relative_to(ROOT)} — {out.stat().st_size/1e6:.1f} MB")

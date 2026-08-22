#!/usr/bin/env python3
"""数据体检：id 唯一、字段齐全、图片存在、无孤儿图、体积在阈值内。CI 会跑这个。"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
REQUIRED = ["id", "title", "category", "prompt", "img", "thumb"]
MAX_FULL_KB = 600
MAX_THUMB_KB = 120

errors, warnings = [], []
payload = json.loads(DATA.read_text(encoding="utf-8"))
assets = payload["assets"]

seen = set()
used = set()
for a in assets:
    aid = a.get("id", "?")
    for f in REQUIRED:
        if not a.get(f):
            errors.append(f"{aid}: 缺字段 {f}")
    if aid in seen:
        errors.append(f"{aid}: id 重复")
    seen.add(aid)
    for key, limit in (("img", MAX_FULL_KB), ("thumb", MAX_THUMB_KB)):
        rel = a.get(key)
        if not rel:
            continue
        p = ROOT / rel
        used.add(p.resolve())
        if not p.exists():
            errors.append(f"{aid}: 图片不存在 {rel}")
        elif p.stat().st_size > limit * 1024:
            warnings.append(f"{aid}: {rel} 过大 ({p.stat().st_size//1024} KB > {limit} KB)")
    for k, shot in enumerate(a.get("shots") or [], 1):
        for key, limit in (("img", MAX_FULL_KB), ("thumb", MAX_THUMB_KB)):
            rel = shot.get(key)
            if not rel:
                continue
            p = ROOT / rel
            used.add(p.resolve())
            if not p.exists():
                errors.append(f"{aid} 第{k}张: 图片不存在 {rel}")
            elif p.stat().st_size > limit * 1024:
                warnings.append(f"{aid} 第{k}张: {rel} 过大 ({p.stat().st_size//1024} KB > {limit} KB)")

for p in (ROOT / "assets").rglob("*.webp"):
    if p.resolve() not in used:
        warnings.append(f"孤儿图片（未被引用）: {p.relative_to(ROOT)}")

pending = [a["id"] for a in assets if a.get("needsPrompt") or a.get("prompt") == "（待补提示词）"]
if pending:
    warnings.append(f"{len(pending)} 条还没提示词：{', '.join(pending[:8])}")

total_mb = sum(p.stat().st_size for p in (ROOT / "assets").rglob("*") if p.is_file()) / 1e6
shot_total = sum(len(a.get("shots") or [1]) for a in assets)
print(f"资产 {len(assets)} 条 | 示例图 {shot_total} 张 | 图片总体积 {total_mb:.1f} MB | 分类 {len(payload.get('cats', []))} 个")
if total_mb > 700:
    warnings.append(f"图片总体积 {total_mb:.0f} MB，接近 GitHub Pages 的 1 GB 上限")

for w in warnings:
    print("! " + w)
for e in errors:
    print("✗ " + e)
print("✓ 校验通过" if not errors else f"✗ {len(errors)} 个错误")
sys.exit(1 if errors else 0)

#!/usr/bin/env python3
"""数据体检：id 唯一、字段齐全、图片存在、无孤儿图、体积在阈值内。CI 会跑这个。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import merge_i18n  # noqa: E402  （译文键算法只有一份实现，CI 必须复用它）

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
I18N = ROOT / "data" / "i18n.txt"
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

# 图片内容哈希：没有它「同一张图换名再入库」就没人拦得住。
# 全库已回填（scripts/backfill_srchash.py），所以从今往后缺了就是错。
no_hash = []
for a in assets:
    aid = a.get("id", "?")
    if not a.get("imgHash"):
        no_hash.append(aid)
    main_img = a.get("img")
    for k, shot in enumerate(a.get("shots") or [], 1):
        # shots[0] 通常就是主图那一张，哈希记在条目上，别重复要求
        if not shot.get("img") or shot.get("img") == main_img:
            continue
        if not shot.get("imgHash"):
            no_hash.append(f"{aid}#{k}")
if no_hash:
    errors.append(f"{len(no_hash)} 处缺 imgHash（跑 scripts/backfill_srchash.py 补）："
                  f"{', '.join(no_hash[:8])}{' …' if len(no_hash) > 8 else ''}")

# 译文缺口：外文原版必须有中文译文，否则线上静默缺翻译。
# 判定口径与 scripts/merge_i18n.py 一致（剔 MJ 参数后看汉字/拉丁比例）。
# 写在 data/i18n.txt 里的也算数——前端直接读它，不跑 merge 也能显示。
table = merge_i18n.parse_i18n(I18N.read_text(encoding="utf-8")) if I18N.exists() else {}
gaps = []
for a in assets:
    prompt = str(a.get("prompt") or "")
    if not prompt.strip() or merge_i18n.is_cn(prompt):
        continue                      # 中文原版按规矩不译
    if str(a.get("zh") or "").strip():
        continue
    key = merge_i18n.i18n_key(prompt)
    if (table.get(key) or {}).get("zh"):
        continue                      # 覆盖层里有，线上不会缺
    gaps.append((str(a.get("id") or "?"), str(a.get("title") or "")[:18], key))
if gaps:
    errors.append(f"外文原版缺中文译文 {len(gaps)} 条（补进 data/i18n.txt 再跑 scripts/merge_i18n.py）："
                  + "; ".join(f"{i} → ## {k} zh" for i, t, k in gaps[:5])
                  + (" …" if len(gaps) > 5 else ""))

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

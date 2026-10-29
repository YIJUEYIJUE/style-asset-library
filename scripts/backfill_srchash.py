#!/usr/bin/env python3
"""给已有条目补图片内容哈希（imgHash），顺带把库里现存的重复图揪出来。

背景：srcHash 只在首批 ingest（A001–A092）写过，A093 起 add_style.py 压根不写，
所以「同一张图换名再入库」一直没人拦。srcHash 依赖源图、补不回来，
但 imgHash 算的是仓库里的 assets/full/*.webp，可以 100% 回填。

用法：
  python3 scripts/backfill_srchash.py            # 回填并写回 styles.json
  python3 scripts/backfill_srchash.py --check    # 只体检不写文件（CI 可用）

体检项：
  1. 缺 imgHash 的条目（回填目标）
  2. 库内重复图：不同条目却压出了字节完全一样的 webp —— 真重复，人工确认是否删
  3. 引用了不存在文件的条目（顺手查，避免哈希落空）
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import imghash  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只体检，不写回 styles.json")
    args = ap.parse_args()

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    assets = payload["assets"]

    missing, broken, filled, by_hash = [], [], 0, {}
    for holder, tag, rel in imghash.iter_images(assets):
        p = ROOT / rel
        if not p.exists():
            broken.append(f"{tag}: 文件不存在 {rel}")
            continue
        h = imghash.sha1_file(p)
        by_hash.setdefault(h, []).append(tag)
        if not holder.get("imgHash"):
            missing.append(tag)
            if not args.check:
                holder["imgHash"] = h
                filled += 1
        elif holder["imgHash"] != h:
            broken.append(f"{tag}: 已有 imgHash 与文件不符（文件被换过？）")

    dups = {h: tags for h, tags in by_hash.items() if len(tags) > 1}

    total = sum(1 for _ in imghash.iter_images(assets))
    have_src = sum(1 for a in assets if a.get("srcHash"))
    print(f"图片 {total} 张 · 条目 {len(assets)} 条")
    print(f"srcHash（源图，补不回来）覆盖 {have_src}/{len(assets)} 条 · "
          f"imgHash（压后图）覆盖 {total - len(missing)}/{total} 张")
    if missing:
        print(f"· 缺 imgHash {len(missing)} 处{'（本次已回填）' if not args.check else ''}"
              f"：{', '.join(missing[:8])}{' …' if len(missing) > 8 else ''}")
    else:
        print("· imgHash 已全部就位 ✓")

    if dups:
        print(f"!! 库内重复图 {len(dups)} 组（字节完全一样，多半是同一张图入库了两次）：")
        for h, tags in list(dups.items())[:10]:
            print(f"   {h}  ←  {' / '.join(tags)}")
    else:
        print("· 未发现重复图 ✓")

    for b in broken:
        print("! " + b)

    if args.check:
        print("· --check：未写文件")
        return 1 if (missing or dups or broken) else 0

    if not filled:
        print("· 没有需要回填的内容，styles.json 未改动")
        return 0
    DATA.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"· 已回填 {filled} 处 imgHash 并写回 {DATA.relative_to(ROOT)}"
          f"（记得 python3 scripts/validate.py 再推）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

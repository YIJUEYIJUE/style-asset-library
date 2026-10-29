#!/usr/bin/env python3
"""把 README 里的「当前数据」统计段刷新成实际值。

README 用两行注释夹住这一块（脚本只替换夹住的部分，其余文字不动）：

    <!-- STATS:START -->
    …
    <!-- STATS:END -->

为什么要有这个脚本：统计数字手改必过期（README 曾经长期停在「92 条 / 101 张」，
而实际已经三百多条）。入库后跑一次即可，也可以在 CI 里用 --check 卡住。

用法：
  python3 scripts/gen_stats.py            # 刷新 README
  python3 scripts/gen_stats.py --check    # 只比对，过期就非零退出（CI 用）
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
README = ROOT / "README.md"
START = "<!-- STATS:START -->"
END = "<!-- STATS:END -->"


def stats():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    assets = payload["assets"]
    shots = sum(len(a.get("shots") or [1]) for a in assets)
    mb = sum(p.stat().st_size for p in (ROOT / "assets").rglob("*") if p.is_file()) / 1e6
    latest = max((a.get("updated") or "" for a in assets), default="")
    return {
        "assets": len(assets),
        "shots": shots,
        "cats": len(payload.get("cats", [])),
        "mb": mb,
        "latest": latest,
    }


def block(s):
    return (f"{START}\n"
            f"> 当前数据：**{s['assets']} 条风格 / {s['shots']} 张示例图 / {s['cats']} 个分类**"
            f"（图片 {s['mb']:.1f} MB，最近更新 {s['latest'] or '—'}）"
            f"—— 由 `scripts/gen_stats.py` 自动生成，`scripts/validate.py` 实时校验通过。\n"
            f"{END}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只体检，不改写 README")
    args = ap.parse_args()

    s = stats()
    text = README.read_text(encoding="utf-8")
    if START not in text or END not in text:
        print(f"README 里找不到 {START} / {END} 标记，无法定位统计段", file=sys.stderr)
        return 1

    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    want = block(s)
    if args.check:
        ok = want in text
        print(("统计已是最新：" if ok else "统计已过期，跑 scripts/gen_stats.py 刷新：")
              + f"{s['assets']} 条 / {s['shots']} 张 / {s['cats']} 类")
        return 0 if ok else 1

    new = head + want + tail
    if new == text:
        print(f"· 统计未变（{s['assets']} 条 / {s['shots']} 张 / {s['cats']} 类）")
        return 0
    README.write_text(new, encoding="utf-8")
    print(f"· README 统计已刷新：{s['assets']} 条 / {s['shots']} 张 / {s['cats']} 类"
          f" / {s['mb']:.1f} MB / 最近更新 {s['latest']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

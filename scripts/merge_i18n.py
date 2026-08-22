#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 data/i18n.txt 的中英对照 / 补充说明合并进 data/styles.json。

为什么单独放一个覆盖层：
- 译文和补充说明是人写的，重新 ingest / 换 id / 改标题都不该把它们冲掉；
- 所以覆盖层按「提示词内容」挂载，不按 id。

前端（app.js）会直接 fetch data/i18n.txt，所以**不跑这个脚本网页也能显示**。
跑它只是把覆盖层固化进 styles.json（比如要做离线单文件构建时）。
日常最常用的是 --check，只体检不写文件。

键算法必须与 app.js 里的 i18nKey() 逐字一致：
    只留 0-9 A-Z a-z 和汉字 → 转小写 → 取前 120 字 → FNV-1a 32 位 → base36

i18n.txt 块格式：
    ## <key> zh|en|note
    （正文，一直到下一个 "## " 或文件尾）

用法：
  python3 scripts/merge_i18n.py --check                # 只体检：谁命中、谁还缺译文
  python3 scripts/merge_i18n.py --check --all          # 不截断，列全部缺口
  python3 scripts/merge_i18n.py                        # 把 zh / en / note 写回 styles.json
  python3 scripts/merge_i18n.py --key "提示词全文"       # 算某段提示词的键，方便建块
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / "data" / "styles.json"
I18N = ROOT / "data" / "i18n.txt"

DROP = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]")
BLOCK = re.compile(r"^##\s+(\S+)\s+(zh|en|note)\s*$")
CJK = re.compile(r"[\u4e00-\u9fff]")
DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"
FIELDS = ("zh", "en", "note")


def base36(n: int) -> str:
    if n == 0:
        return "0"
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(DIGITS[r])
    return "".join(reversed(out))


def i18n_key(s: str) -> str:
    """与 app.js 的 i18nKey() 必须字字相同，改这里就要同步改前端。"""
    t = DROP.sub("", str(s or "")).lower()[:120]
    h = 0x811C9DC5
    for ch in t:
        h ^= ord(ch) & 0xFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return base36(h)


def parse_i18n(text: str) -> dict:
    table = {}
    key = field = None
    buf = []

    def flush(k, f, b):
        if not k or not f:
            return
        v = "\n".join(b).lstrip("\n").rstrip()
        if v:
            table.setdefault(k, {})[f] = v

    for line in text.splitlines():
        m = BLOCK.match(line)
        if m:
            flush(key, field, buf)
            key, field, buf = m.group(1), m.group(2), []
            continue
        if key:
            buf.append(line)
    flush(key, field, buf)
    return table


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只体检，不写回 styles.json")
    ap.add_argument("--all", action="store_true", help="体检时列出全部缺口，不截断")
    ap.add_argument("--key", help="算一段提示词的覆盖层键并退出")
    args = ap.parse_args()

    if args.key:
        print(i18n_key(args.key))
        return 0

    if not STYLES.exists():
        print(f"找不到 {STYLES}", file=sys.stderr)
        return 1
    data = json.loads(STYLES.read_text(encoding="utf-8"))
    assets = data.get("assets") or []

    table = parse_i18n(I18N.read_text(encoding="utf-8")) if I18N.exists() else {}
    if not table:
        print(f"! 覆盖层 data/{I18N.name} 为空或不存在，本次只做体检")

    hit = 0
    wrote = {f: 0 for f in FIELDS}
    gaps = []
    orphan = set(table)
    for a in assets:
        prompt = str(a.get("prompt") or "")
        k = i18n_key(prompt)
        entry = table.get(k)
        if entry:
            hit += 1
            orphan.discard(k)
            for f in FIELDS:
                v = entry.get(f)
                if v and not str(a.get(f) or "").strip():
                    a[f] = v
                    wrote[f] += 1
        if prompt.strip():
            # 英文提示词要有 zh，中文提示词要有 en，两边都能切
            want = "en" if CJK.search(prompt) else "zh"
            if not str(a.get(want) or "").strip():
                gaps.append((str(a.get("id") or "?"), str(a.get("title") or "")[:20], want, k))

    print(f"风格 {len(assets)} 条 · 覆盖层 {len(table)} 组 · 命中 {hit} 条")
    print(f"待写入：zh {wrote['zh']} · en {wrote['en']} · note {wrote['note']}")
    if orphan:
        print(f"! 有 {len(orphan)} 组覆盖层没挂上任何风格（提示词改过？）：{', '.join(sorted(orphan))}")
    if gaps:
        print(f"还缺对照 {len(gaps)} 条，下面的块头可以直接拷进 data/i18n.txt：")
        show = gaps if args.all else gaps[:20]
        for sid, title, want, k in show:
            print(f"  {sid}  {title}  →  ## {k} {want}")
        if len(show) < len(gaps):
            print(f"  … 还有 {len(gaps) - len(show)} 条，加 --all 全看")
    else:
        print("对照齐了 ✓")

    if args.check:
        print("· --check：未写文件")
        return 0
    if not any(wrote.values()):
        print("· 没有需要写入的内容，styles.json 未改动")
        return 0
    STYLES.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"· 已写回 {STYLES.relative_to(ROOT)}（记得 python3 scripts/validate.py 再推）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

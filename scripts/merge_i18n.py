#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 data/i18n.txt 的中英对照 / 补充说明合并进 data/styles.json。

为什么单独放一个覆盖层：
- 译文和补充说明是人写的，重新 ingest / 换 id / 改标题都不该把它们冲掉；
- 所以覆盖层按「提示词内容」挂载，不按 id。

前端（app.js）会直接 fetch data/i18n.txt，所以**不跑这个脚本网页也能显示**。
跑它只是把覆盖层固化进 styles.json（比如要做离线单文件构建时）。
日常最常用的是 --check，只体检不写文件。

=== 键算法（必须与 app.js 的 i18nKey / i18nKeyShort 逐字一致）===
    归一化：只留 0-9 A-Z a-z 和汉字 → 转小写
    主键 i18n_key       = FNV-1a 32 位(整段归一化文本) → base36
    副键 i18n_key_short = FNV-1a 32 位(归一化后的前 120 字) → base36

为什么要两个键：
- 主键唯一性强，是首选；
- 副键容忍提示词被小改（改了尾巴也还能挂上），但**开头完全一样的模板会撞车**
  （例：A003 与 A004 前 120 字一模一样）。
- 因此挂载规则是：主键优先；主键没命中才退回副键；**任何一个键命中多条风格，
  一律放弃套用**——宁可这条没译文，也绝不能把译文安到别的风格头上。

i18n.txt 块格式：
    ## <key> zh|en|note
    （正文，一直到下一个 "## " 或文件尾）

用法：
  python3 scripts/merge_i18n.py --check                # 只体检：谁命中、谁撞车、谁还缺译文
  python3 scripts/merge_i18n.py --check --all          # 不截断，列全部缺口
  python3 scripts/merge_i18n.py                        # 把 zh / en / note 写回 styles.json
  python3 scripts/merge_i18n.py --key "提示词全文"       # 算某段提示词的主键与副键
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
LAT = re.compile(r"[A-Za-z]")
DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz"
FIELDS = ("zh", "en", "note")
SHORT_LEN = 120


def base36(n: int) -> str:
    if n == 0:
        return "0"
    out = []
    while n:
        n, r = divmod(n, 36)
        out.append(DIGITS[r])
    return "".join(reversed(out))


def fnv1a36(t: str) -> str:
    h = 0x811C9DC5
    for ch in t:
        h ^= ord(ch) & 0xFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return base36(h)


def norm_prompt(s) -> str:
    return DROP.sub("", str(s or "")).lower()


def i18n_key(s) -> str:
    """主键：整段提示词。与 app.js 的 i18nKey() 必须字字相同。"""
    return fnv1a36(norm_prompt(s))


def i18n_key_short(s) -> str:
    """副键：前 120 字。与 app.js 的 i18nKeyShort() 必须字字相同。"""
    return fnv1a36(norm_prompt(s)[:SHORT_LEN])


def is_cn(s) -> bool:
    """原版是不是中文。与 app.js 的 isCN() 一致：汉字数 * 3 >= 拉丁字母数。

    规矩（用户定的）：原版本来就是中文的，不需要中文译文，也不强制配英文。
    只有原版不是中文的，才必须补 zh。
    """
    t = str(s or "")
    cjk = len(CJK.findall(t))
    lat = len(LAT.findall(t))
    return cjk > 0 and cjk * 3 >= lat


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


def label(a) -> str:
    return f"{a.get('id') or '?'} {str(a.get('title') or '')[:18]}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只体检，不写回 styles.json")
    ap.add_argument("--all", action="store_true", help="体检时列出全部缺口，不截断")
    ap.add_argument("--key", help="算一段提示词的覆盖层键并退出")
    args = ap.parse_args()

    if args.key:
        print(f"主键（推荐写进 i18n.txt）：{i18n_key(args.key)}")
        print(f"副键（前 {SHORT_LEN} 字，兼容旧块）：{i18n_key_short(args.key)}")
        return 0

    if not STYLES.exists():
        print(f"找不到 {STYLES}", file=sys.stderr)
        return 1
    data = json.loads(STYLES.read_text(encoding="utf-8"))
    assets = data.get("assets") or []

    table = parse_i18n(I18N.read_text(encoding="utf-8")) if I18N.exists() else {}
    if not table:
        print(f"! 覆盖层 data/{I18N.name} 为空或不存在，本次只做体检")

    # 建两张索引，值是「命中这个键的风格列表」——列表长度 > 1 就是撞车
    by_full, by_short = {}, {}
    for a in assets:
        by_full.setdefault(i18n_key(a.get("prompt")), []).append(a)
        by_short.setdefault(i18n_key_short(a.get("prompt")), []).append(a)

    # 撞车体检：主键撞车 = 两条提示词一字不差（应该合并或改一条）
    #           副键撞车 = 开头 120 字一样（正常，只是这些键不能再用作副键挂载）
    dup_full = {k: v for k, v in by_full.items() if len(v) > 1}
    dup_short = {k: v for k, v in by_short.items() if len(v) > 1 and k not in dup_full}

    hit = 0
    wrote = {f: 0 for f in FIELDS}
    orphan, blocked = [], []
    for k, entry in table.items():
        cands = by_full.get(k) or by_short.get(k)
        if not cands:
            orphan.append(k)
            continue
        if len(cands) > 1:
            # 宁可不套用，也不能套错
            blocked.append((k, [label(x) for x in cands]))
            continue
        a = cands[0]
        hit += 1
        for f in FIELDS:
            v = entry.get(f)
            if v and not str(a.get(f) or "").strip():
                a[f] = v
                wrote[f] += 1

    # 缺口：只有「原版不是中文」的才必须有 zh。原版是中文的不译，不报缺。
    gaps = []
    for a in assets:
        prompt = str(a.get("prompt") or "")
        if not prompt.strip() or is_cn(prompt):
            continue
        if not str(a.get("zh") or "").strip():
            gaps.append((str(a.get("id") or "?"), str(a.get("title") or "")[:20], i18n_key(prompt)))

    cn_n = sum(1 for a in assets if is_cn(a.get("prompt")))
    print(f"风格 {len(assets)} 条（中文原版 {cn_n} · 外文原版 {len(assets) - cn_n}） · 覆盖层 {len(table)} 组 · 命中 {hit} 条")
    print(f"待写入：zh {wrote['zh']} · en {wrote['en']} · note {wrote['note']}")

    if dup_full:
        print(f"!! 主键撞车 {len(dup_full)} 组 —— 这些风格的提示词一字不差，请合并或修正：")
        for k, v in dup_full.items():
            print(f"   {k}  ←  {' / '.join(label(x) for x in v)}")
    if dup_short:
        print(f"·  副键撞车 {len(dup_short)} 组（开头 {SHORT_LEN} 字相同，属正常，仅提醒别用副键挂它们）：")
        for k, v in dup_short.items():
            print(f"   {k}  ←  {' / '.join(label(x) for x in v)}")
    if blocked:
        print(f"!! 有 {len(blocked)} 组覆盖层因为撞车被拒绝套用，请改用主键重写块头：")
        for k, names in blocked:
            print(f"   ## {k}  ←  {' / '.join(names)}")
    if orphan:
        print(f"!  有 {len(orphan)} 组覆盖层没挂上任何风格（提示词改过？）：{', '.join(sorted(orphan))}")

    if gaps:
        print(f"外文原版还缺中文译文 {len(gaps)} 条，下面的块头可以直接拷进 data/i18n.txt：")
        show = gaps if args.all else gaps[:20]
        for sid, title, k in show:
            print(f"   {sid}  {title}  →  ## {k} zh")
        if len(show) < len(gaps):
            print(f"   … 还有 {len(gaps) - len(show)} 条，加 --all 全看")
    else:
        print("外文原版的中文译文齐了 ✓（中文原版按规矩不译）")

    if args.check:
        print("· --check：未写文件")
        return 0 if not dup_full and not blocked else 1
    if not any(wrote.values()):
        print("· 没有需要写入的内容，styles.json 未改动")
        return 0
    STYLES.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"· 已写回 {STYLES.relative_to(ROOT)}（记得 python3 scripts/validate.py 再推）")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""把 data/styles.json 拆成「轻量目录 + 全文分块」，让首屏不再等 1.1MB。

产物
----
data/catalog.json        轻量目录：只有列表渲染与筛选需要的字段（不含 prompt / 译文 / 说明）
data/chunks/chunk-NNN.json  全文分块：每块一小组条目的完整字段（含 prompt / zh / en / note / shots）

前端 behavior（app.js）：
  1. 启动时只拉 catalog.json，立刻出列表、能筛选、能按标题/标签/模型搜索；
  2. 后台按顺序把 chunk 拉下来，把 prompt 等重字段补进同一批对象里，
     补一块重渲一次，搜索范围随之扩大到提示词原文与译文；
  3. catalog.json 拿不到（比如老版本部署）时自动退回整包 styles.json。

所以 styles.json 仍然是唯一权威数据源，catalog 与 chunks 都是它的派生产物，
**入库后必须重跑本脚本**，CI 用 --check 卡这件事。

用法：
  python3 scripts/split_data.py            # 重新生成
  python3 scripts/split_data.py --check    # 只体检，与 styles.json 不一致就非零退出
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "styles.json"
CATALOG = ROOT / "data" / "catalog.json"
CHUNKS = ROOT / "data" / "chunks"
CHUNK_SIZE = 40

# 列表卡片、筛选、搜索（除 prompt/译文/说明外）真正用到的字段
LIGHT = ["id", "seq", "title", "category", "kind", "tone", "model", "palette",
         "tags", "aspect", "img", "thumb", "w", "h", "updated", "imgHash"]


def light_copy(a, idx):
    out = {k: a.get(k) for k in LIGHT if k in a}
    out["chunk"] = idx
    out["shotCount"] = len(a.get("shots") or [])
    out["hasAlt"] = bool(str(a.get("zh") or "").strip() or str(a.get("en") or "").strip())
    return out


def build(payload):
    assets = payload["assets"]
    catalog, chunks = [], []
    for i, start in enumerate(range(0, len(assets), CHUNK_SIZE)):
        group = assets[start:start + CHUNK_SIZE]
        chunks.append({"index": i, "ids": [a.get("id") for a in group], "assets": group})
        catalog.extend(light_copy(a, i) for a in group)
    return {
        "chunkSize": CHUNK_SIZE,
        "chunks": len(chunks),
        "count": len(assets),
        "cats": payload.get("cats", []),
        "hero": payload.get("hero", []),
        "assets": catalog,
    }, chunks


def write(catalog, chunks):
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf-8")
    CHUNKS.mkdir(parents=True, exist_ok=True)
    for c in chunks:
        p = CHUNKS / f"chunk-{c['index']:03d}.json"
        p.write_text(json.dumps({"index": c["index"], "assets": c["assets"]},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def check(payload):
    """与 styles.json 比对：条数、id 覆盖、每块内容、imgHash 是否都还对得上。"""
    errs = []
    if not CATALOG.exists():
        return [f"缺少 {CATALOG.name}（跑 scripts/split_data.py 生成）"]
    cat = json.loads(CATALOG.read_text(encoding="utf-8"))
    full = payload["assets"]

    if cat.get("count") != len(full):
        errs.append(f"目录条数 {cat.get('count')} ≠ styles.json {len(full)}")
    by_id = {a.get("id"): a for a in full}
    cat_ids = [a.get("id") for a in cat.get("assets") or []]
    if cat_ids != [a.get("id") for a in full]:
        errs.append("目录里的条目顺序 / id 与 styles.json 不一致")

    got_ids = []
    for i in range(cat.get("chunks") or 0):
        p = CHUNKS / f"chunk-{i:03d}.json"
        if not p.exists():
            errs.append(f"缺少分块 {p.name}")
            continue
        for a in json.loads(p.read_text(encoding="utf-8")).get("assets") or []:
            got_ids.append(a.get("id"))
            src = by_id.get(a.get("id"))
            if not src:
                errs.append(f"{p.name} 里有 styles.json 中不存在的 id：{a.get('id')}")
                continue
            if a.get("imgHash") != src.get("imgHash"):
                errs.append(f"{a.get('id')} 的分块内容与 styles.json 不一致（imgHash 变了）")
            if not str(a.get("prompt") or "").strip():
                errs.append(f"{a.get('id')} 的分块里没有 prompt")
    missing = [i for i in by_id if i not in set(got_ids)]
    if missing:
        errs.append(f"{len(missing)} 条没有被任何分块覆盖：{', '.join(sorted(missing)[:6])}")

    for a in cat.get("assets") or []:
        src = by_id.get(a.get("id"))
        if src and a.get("imgHash") != src.get("imgHash"):
            errs.append(f"{a.get('id')} 的目录 imgHash 与 styles.json 不一致")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只体检，不写文件")
    args = ap.parse_args()

    payload = json.loads(DATA.read_text(encoding="utf-8"))
    if args.check:
        errs = check(payload)
        if errs:
            print("✗ 分片与 styles.json 不一致（入库后忘了跑 scripts/split_data.py？）：")
            for e in errs[:10]:
                print("   " + e)
            return 1
        cat = json.loads(CATALOG.read_text(encoding="utf-8"))
        print(f"✓ 分片一致：目录 {CATALOG.stat().st_size // 1024} KB / "
              f"{cat.get('chunks')} 块 / {cat.get('count')} 条")
        return 0

    catalog, chunks = build(payload)
    write(catalog, chunks)
    total = sum(p.stat().st_size for p in CHUNKS.rglob("*.json"))
    print(f"· 目录 data/catalog.json {CATALOG.stat().st_size // 1024} KB"
          f"（原 styles.json {DATA.stat().st_size // 1024} KB）")
    print(f"· 分块 {len(chunks)} 个，合计 {total // 1024} KB（每块 {CHUNK_SIZE} 条）")
    print("· 入库后记得重跑；CI 会用 --check 校验")
    return 0


if __name__ == "__main__":
    sys.exit(main())

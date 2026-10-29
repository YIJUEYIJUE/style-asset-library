#!/usr/bin/env python3
"""图片内容哈希：新增条目去重 / 回填全库哈希 的唯一实现入口。

为什么要有两个哈希
------------------
srcHash  源图（用户手里那张原始文件）的哈希。只在入库那一刻能算到，
        因为原始素材不落仓库（README 有写），所以 A093 之后补不回来。
imgHash  仓库里 assets/full/*.webp（压后副本）的哈希。永远可重算，
        是真正能覆盖 100% 条目的去重依据。

两者都取 SHA1 前 16 位（与 scripts/ingest.py 的 sha1_file 同口径），
短到可以肉眼比对，又足够避开随机碰撞。

去重语义
--------
同一张图换个文件名、换个格式再入库：
  · 源图字节一样  → srcHash 命中
  · 源图被重新导出/转码，字节变了，但压出来的 webp 一样 → imgHash 命中
两条路任一命中就拦下，除非显式 --force。
"""
import hashlib
from pathlib import Path

LEN = 16


def sha1_file(p) -> str:
    """文件内容的 SHA1 前 16 位。"""
    h = hashlib.sha1()
    h.update(Path(p).read_bytes())
    return h.hexdigest()[:LEN]


def sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()[:LEN]


def iter_images(assets):
    """产出 (持有者, 位置标签, 仓库内相对路径)。位置标签形如 A123 / A123#3。

    同一张图只算一次：shots[0] 通常就是主图，路径重复时跳过，
    否则每张图都会被自己"重复"一次，体检报告全是噪音。
    """
    for a in assets:
        aid = a.get("id") or "?"
        seen = set()
        main = a.get("img")
        if main:
            seen.add(main)
            yield a, aid, main
        for k, shot in enumerate(a.get("shots") or [], 1):
            rel = shot.get("img")
            if rel and rel not in seen:
                seen.add(rel)
                yield shot, f"{aid}#{k}", rel


def collect(assets):
    """扫全库已登记的哈希 → {hash: 位置标签}。srcHash 与 imgHash 都收录。"""
    table = {}
    for a in assets:
        aid = a.get("id") or "?"
        for field, tag in (("srcHash", aid), ("imgHash", aid)):
            v = a.get(field)
            if v:
                table.setdefault(v, tag)
        for k, shot in enumerate(a.get("shots") or [], 1):
            for field in ("srcHash", "imgHash"):
                v = shot.get(field)
                if v:
                    table.setdefault(v, f"{aid}#{k}")
    return table


def find_dup(table, *hashes):
    """返回第一个命中已有条目的 (hash, 位置标签)，没命中返回 None。"""
    for h in hashes:
        if h and h in table:
            return h, table[h]
    return None

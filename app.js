/* 风格资产库 — 静态站点前端
   数据: data/styles.json + data/i18n.txt   图片: assets/thumb (列表/画布) + assets/full (详情) */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelector(s) || document.createElement("div");
  const esc = (s) =>
    String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let assets = [], categories = [], heroIds = [], catTree = [];
  let current = "ALL", model = "ALL", q = "", selected = null, visible = [];
  let openKind = "";      // 侧栏当前展开的大类（手风琴，一次只开一个）
  let onlyPicks = false, moved = false;
  let promptLang = "o";   // 看片台当前页签：o=原文 / z=译文，跨风格保持

  /* ---------- 中英对照 / 补充说明覆盖层（data/i18n.txt） ---------- */
  // 按「提示词内容」挂载，不按 id：改标题、换 id、重新 ingest 都不会把译文弄丢。
  // 算法必须与 scripts/merge_i18n.py 里的 i18n_key() / i18n_key_short() 完全一致。
  const normPrompt = (s) => String(s || "").replace(/[^0-9A-Za-z\u4e00-\u9fff]/g, "").toLowerCase();
  function fnv1a36(t) {
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  const i18nKey = (s) => fnv1a36(normPrompt(s));                    // 主键：整段提示词
  const i18nKeyShort = (s) => fnv1a36(normPrompt(s).slice(0, 120)); // 副键：前 120 字，提示词被小改过也能挂上

  function parseI18n(text) {
    const map = new Map();
    let key = null, field = null, buf = [];
    const flush = () => {
      if (key && field) {
        const v = buf.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
        if (v) { const e = map.get(key) || {}; e[field] = v; map.set(key, e); }
      }
      buf = [];
    };
    String(text || "").split(/\r?\n/).forEach((line) => {
      const m = /^##\s+(\S+)\s+(zh|en|note)\s*$/.exec(line);
      if (m) { flush(); key = m[1]; field = m[2]; return; }
      if (key) buf.push(line);
    });
    flush();
    return map;
  }

  async function loadI18n() {
    try {
      const inline = document.getElementById("i18n");   // 离线单文件构建时内联
      let txt = "";
      if (inline) txt = inline.textContent;
      else {
        const r = await fetch("data/i18n.txt", { cache: "no-cache" });
        if (!r.ok) return;
        txt = await r.text();
      }
      const map = parseI18n(txt);
      if (!map.size) return;
      // 一个 key 只有唯一命中才套用。A003 / A004 这类开头完全一样的模板会撞副键，
      // 撞了宁可不套用，也绝不能把译文 / 补充说明安到别的风格头上。
      const push = (m, k, a) => { const arr = m.get(k); if (arr) arr.push(a); else m.set(k, [a]); };
      const byFull = new Map(), byShort = new Map();
      assets.forEach((a) => { push(byFull, i18nKey(a.prompt), a); push(byShort, i18nKeyShort(a.prompt), a); });
      map.forEach((e, k) => {
        const hit = byFull.get(k) || byShort.get(k);
        if (!hit || hit.length !== 1) return;
        const a = hit[0];
        if (e.zh && !a.zh) a.zh = e.zh;
        if (e.en && !a.en) a.en = e.en;
        if (e.note && !a.note) a.note = e.note;   // styles.json 里已有就不覆盖
      });
    } catch (err) { /* 覆盖层缺失不影响主流程 */ }
  }

  // Midjourney 参数段，只用于语种判定（不改动 prompt 原文）。与 merge_i18n.py 的 MJ_PARAM 必须一致。
  const MJ_PARAM = /--[A-Za-z_]+(?:[ \t]+[^\s\u4e00-\u9fff]+)?/g;
  // 原版是不是中文：按汉字与拉丁字母的比例判，掺了几个英文单词的中文提示词依然算中文。
  // 判定前先剔掉 --ar 9:16 / --profile xxx / --stylize 200 这类参数，
  // 否则「男人 --chaos 10 --ar 9:16 --profile wya46hy --stylize 200」会被参数里的英文压成「外文」。
  function isCN(s) {
    const t = String(s || "").replace(MJ_PARAM, " ");
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    const lat = (t.match(/[A-Za-z]/g) || []).length;
    return cjk > 0 && cjk * 3 >= lat;
  }
  // 另一个语言版本。硬规矩：原版本来就是中文的，不给它配中文译文，页签直接不出现。
  function altOf(a) {
    if (!a) return { text: "", label: "中文译文" };
    const cn = isCN(a.prompt);
    if (!cn && a.zh && String(a.zh).trim()) return { text: String(a.zh), label: "中文译文" };
    if (cn && a.en && String(a.en).trim()) return { text: String(a.en), label: "English" };
    return { text: "", label: "中文译文" };
  }

  /* ---------- 挑选夹（本地保存） ---------- */
  let picks = new Set();
  try { picks = new Set(JSON.parse(localStorage.getItem("sal.picks") || "[]")); } catch (e) {}
  const savePicks = () => { try { localStorage.setItem("sal.picks", JSON.stringify([...picks])); } catch (e) {} };

  /* ---------- views ---------- */
  const showLib = () => { $("#cover").classList.add("hide"); $("#library").classList.add("show"); };
  function resetCoverTop() {
    const c = $("#cover");
    c.style.scrollBehavior = "auto"; c.scrollTop = 0; c.style.setProperty("--p", "0");
    requestAnimationFrame(() => { c.scrollTop = 0; c.style.setProperty("--p", "0"); c.style.scrollBehavior = ""; });
  }
  function showCover() { closeCanvas(); $("#library").classList.remove("show"); $("#cover").classList.remove("hide"); resetCoverTop(); }

  /* ---------- 分类（只给网格库用）：category 用「——」分两级 ---------- */
  const KIND = "KIND:";
  function splitCat(name) {
    const s = String(name || "").trim() || "未分类";
    const i = s.indexOf("——");
    if (i > 0 && i + 2 < s.length) return { kind: s.slice(0, i), sub: s.slice(i + 2) };
    return { kind: s, sub: s };
  }
  const kindOf = (a) => (a && a.kind) ? a.kind : splitCat(a && a.category).kind;
  const isFlat = (g) => g.subs.length === 1 && g.subs[0].label === g.kind;

  function catLabel(cat) {
    if (!cat || cat === "ALL") return "全部资产";
    if (cat.startsWith(KIND)) return cat.slice(KIND.length);
    return cat;
  }
  function matchCat(a) {
    if (current === "ALL") return true;
    if (current.startsWith(KIND)) return kindOf(a) === current.slice(KIND.length);
    return a.category === current;
  }
  function activeKind() {
    if (current === "ALL") return "";
    return current.startsWith(KIND) ? current.slice(KIND.length) : splitCat(current).kind;
  }

  // 以 assets 为准统计，data/styles.json 里的 cats 只用来取 tone / 排序参考
  function buildCatTree() {
    const count = new Map(), tone = new Map(), order = [];
    assets.forEach((a) => {
      const c = (a.category || "").trim() || "未分类";
      if (!count.has(c)) { count.set(c, 0); order.push(c); }
      count.set(c, count.get(c) + 1);
    });
    (categories || []).forEach((c) => { if (c && c.name) tone.set(c.name, c.tone || ""); });
    const known = (categories || []).map((c) => c && c.name).filter((n) => n && count.has(n));
    const names = known.concat(order.filter((n) => !known.includes(n)));

    const groups = new Map();
    names.forEach((name) => {
      const { kind, sub } = splitCat(name);
      if (!groups.has(kind)) groups.set(kind, { kind, count: 0, subs: [] });
      const g = groups.get(kind);
      const n = count.get(name) || 0;
      g.count += n;
      g.subs.push({ name, label: sub, tone: tone.get(name) || "COLLECTION", count: n });
    });
    catTree = [...groups.values()].sort((a, b) => b.count - a.count || b.subs.length - a.subs.length);
    catTree.forEach((g) => g.subs.sort((a, b) => b.count - a.count));
    return catTree;
  }
  const catCount = () => catTree.reduce((n, g) => n + g.subs.length, 0);

  /* ---------- filtering ---------- */
  // opts.ignoreCat：展厅专用——展厅永远是「全部」，不跟网格库的分类筛选走
  function list(opts) {
    const ignoreCat = !!(opts && opts.ignoreCat);
    const qq = q.trim().toLowerCase();
    return assets.filter((a) => {
      if (onlyPicks && !picks.has(a.id)) return false;
      if (!ignoreCat && !matchCat(a)) return false;
      if (model !== "ALL" && a.model !== model) return false;
      if (!qq) return true;
      // 搜索同时覆盖原文、译文和补充说明：搜中文也能命中英文提示词
      return [a.title, a.category, a.kind, a.tone, a.model, a.palette, a.prompt, a.zh, a.en, a.note, (a.tags || []).join(" ")]
        .join(" ").toLowerCase().includes(qq);
    });
  }

  /* ---------- grid ---------- */
  const card = (a) => `<button class="asset${picks.has(a.id) ? " picked" : ""}" data-id="${a.id}">
    <div class="assetImg"><img src="${esc(a.thumb)}" alt="${esc(a.title)}" loading="lazy" decoding="async" width="${a.w || 400}" height="${a.h || 400}"></div>
    ${(a.shots && a.shots.length > 1) ? `<span class="shotCount">${a.shots.length} 图</span>` : ""}
    <span class="pickDot${picks.has(a.id) ? " on" : ""}" data-pick="${a.id}" title="加入挑选">✓</span>
    <div class="assetMeta"><span>${a.seq} / ${esc((a.category || "").replace("——模板", "").replace("（收集）", ""))}</span><span>${a.hot ?? ""}°</span></div>
    <h3>${esc(a.title)}</h3>
    <div class="tags">${(a.tags || []).slice(0, 2).map((t, i) => `<span class="tag${i ? " mint" : ""}">${esc(t)}</span>`).join("")}${altOf(a).text ? `<span class="tag lang">中英</span>` : ""}</div>
  </button>`;

  function renderGrid() {
    visible = list();
    $("#listTitle").textContent = onlyPicks ? "我的挑选" : catLabel(current);
    const scope = onlyPicks ? "" : current === "ALL"
      ? `共 ${catCount()} 个分类 · `
      : current.startsWith(KIND) ? `大类 · ` : `${splitCat(current).kind} · `;
    $("#listSub").textContent = `${scope}${visible.length} 个结果 · 点击卡片看大图与提示词，右上角 ✓ 加入挑选`;
    $("#grid").innerHTML = visible.length
      ? visible.map(card).join("")
      : `<p class="emptyState">${onlyPicks ? "挑选夹还是空的，先去卡片右上角点 ✓。" : "没有匹配的资产，换个关键词或清空筛选试试。"}</p>`;
    updateClearChip();
    if (canvasOpen) rebuildCanvas();
    syncPicks();
  }

  // 只要有任何筛选在生效，就在模型筛选条尾巴上挂一个「清空筛选」
  function updateClearChip() {
    const bar = $("#filterBar");
    if (!bar) return;
    const dirty = current !== "ALL" || model !== "ALL" || !!q.trim() || onlyPicks;
    let btn = bar.querySelector("[data-clear]");
    if (dirty && !btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip clearAll";
      btn.dataset.clear = "1";
      btn.textContent = "✕ 清空筛选";
      bar.appendChild(btn);
    } else if (!dirty && btn) btn.remove();
  }

  function clearAllFilters() {
    current = "ALL"; openKind = ""; model = "ALL"; q = ""; onlyPicks = false;
    const s = $("#search"); if (s) s.value = "";
    renderCats(); renderCatChips(); renderFilters(); renderGrid();
  }

  function renderFilters() {
    const models = [...new Set(assets.map((a) => a.model).filter(Boolean))].sort();
    $("#filterBar").innerHTML =
      `<button class="chip${model === "ALL" ? " on" : ""}" data-model="ALL">全部模型</button>` +
      models.map((m) => `<button class="chip${model === m ? " on" : ""}" data-model="${esc(m)}">${esc(m)}</button>`).join("");
    updateClearChip();
  }

  /* 横向胶囊（只用在窄屏网格库，展厅不放）：全部资产 › 大类 › 当前大类下的子分类 */
  function chipsHtml() {
    const ak = activeKind();
    let h = `<button class="chip${current === "ALL" ? " on" : ""}" data-cat="ALL">全部资产 <i>${assets.length}</i></button>`;
    h += catTree.map((g) => {
      const key = isFlat(g) ? g.subs[0].name : KIND + g.kind;
      const on = current === key || (!isFlat(g) && ak === g.kind);
      return `<button class="chip${on ? " on" : ""}" data-cat="${esc(key)}"${on ? ' title="再点一次取消"' : ""}>${esc(g.kind)} <i>${g.count}</i></button>`;
    }).join("");
    const g = catTree.find((x) => x.kind === ak);
    if (g && !isFlat(g)) {
      h += `<span class="chipSep">›</span>` + g.subs.map((s) =>
        `<button class="chip sub${current === s.name ? " on" : ""}" data-cat="${esc(s.name)}">${esc(s.label)} <i>${s.count}</i></button>`).join("");
    }
    return h;
  }

  function renderCatChips() {
    const a = $("#catChips");
    if (a) a.innerHTML = chipsHtml();
    // #canvasChips 故意不填：展厅只有「全部」
  }

  /* 分类点击总入口。规矩统一：点中的就是已经选中的那一个 → 再点一次撤销。
     - 大类：第一下展开并筛选，第二下收起并回到「全部资产」
     - 子分类：第二下退回它所属的大类（大类保持展开）
     - 扁平分类（没有子分类）：第二下回到「全部资产」 */
  function pickCat(key) {
    if (!key || key === "ALL") {
      current = "ALL"; openKind = "";
    } else if (key.startsWith(KIND)) {
      const kind = key.slice(KIND.length);
      const showing = openKind === kind && (current === key || splitCat(current).kind === kind);
      if (showing) { openKind = ""; current = "ALL"; }
      else { openKind = kind; current = key; }
    } else {
      const kind = splitCat(key).kind;
      const g = catTree.find((x) => x.kind === kind);
      if (current === key) {
        if (g && !isFlat(g)) { current = KIND + kind; openKind = kind; }
        else { current = "ALL"; openKind = ""; }
      } else {
        current = key;
        openKind = (g && !isFlat(g)) ? kind : "";
      }
    }
    renderCats();
    renderCatChips();
    renderGrid();
  }

  /* 侧栏：大类可展开出子分类，再点一次收起 */
  function renderCats() {
    const box = $("#catList");
    if (!box) return;
    const on = (v) => (current === v ? " active" : "");
    let html = `<button class="cat${current === "ALL" ? " active" : ""}" data-cat="ALL"><b>全部资产</b><span>ALL ASSETS</span><i>${assets.length}</i></button>`;
    catTree.forEach((g) => {
      if (isFlat(g)) {
        const s = g.subs[0];
        const act = current === s.name;
        html += `<button class="cat${act ? " active" : ""}" data-cat="${esc(s.name)}"${act ? ' title="再点一次回到全部"' : ""}><b>${esc(s.name)}</b><span>${esc(s.tone)}</span><i>${s.count}</i></button>`;
        return;
      }
      const key = KIND + g.kind;
      const open = openKind === g.kind;
      html += `<div class="catGroup${open ? " open" : ""}">
        <button class="cat catKind${on(key)}" data-cat="${esc(key)}" aria-expanded="${open}" title="${open ? "点此收起" : "点此展开"}"><b>${esc(g.kind)}</b><span>${g.subs.length} 个子分类 · ${open ? "点此收起" : "点此展开"}</span><i>${g.count}</i></button>
        <div class="catSubs">${g.subs.map((s) =>
          `<button class="catSub${on(s.name)}" data-cat="${esc(s.name)}"${current === s.name ? ' title="再点一次回到大类"' : ""}><b>${esc(s.label)}</b><i>${s.count}</i></button>`).join("")}</div>
      </div>`;
    });
    box.innerHTML = html;
  }

  function byId(id) { return assets.find((x) => x.id === id); }

  function initOpening() {
    const heroAssets = heroIds.map(byId).filter(Boolean);
    const hero = heroAssets.length ? heroAssets : assets;
    $("#openingCollage").innerHTML = hero.slice(0, 5).map((a, i) =>
      `<button class="openingCard c${i + 1}" data-id="${esc(a.id)}"><img src="${esc(a.thumb)}" alt="${esc(a.title)}" loading="eager" decoding="async"><b>${esc(a.title)} · ${a.seq}</b></button>`).join("");
    $("#countAll").textContent = assets.length;
    const cc = $("#countCats"); if (cc) cc.textContent = catCount();
    const cover = $("#cover"), stage = $("#openingStage");
    const update = () => {
      const max = Math.max(1, stage.offsetHeight - window.innerHeight);
      cover.style.setProperty("--p", Math.max(0, Math.min(1, cover.scrollTop / (max * 0.46))).toFixed(3));
    };
    cover.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  function renderHeroContent() {
    if (!assets.length) return;
    // 按比例取样，避免写死下标（库里只有几十条时 assets[35] 之类会取空）
    const at = (r) => assets[Math.min(assets.length - 1, Math.max(0, Math.round((assets.length - 1) * r)))];
    const wide = at(0.34) || assets[0];
    const wideImg = $("#wideImg");
    if (wideImg) { wideImg.src = wide.thumb; wideImg.alt = wide.title; wideImg.loading = "lazy"; wideImg.decoding = "async"; }
    const seen = new Set([wide.id]), small = [];
    [0.08, 0.55, 0.88, 0.3, 0.7, 0].forEach((r) => {
      const a = at(r);
      if (small.length < 3 && a && !seen.has(a.id)) { seen.add(a.id); small.push(a); }
    });
    const box = $("#smallFeatures");
    if (box) box.innerHTML = small.map((a, i) =>
      `<div class="smallFeature reveal"><img src="${esc(a.thumb)}" alt="${esc(a.title)}" loading="lazy" decoding="async"><div><b>${["资产索引", "详情层", "无限画布"][i]}</b><span>${esc(a.title)} / ${a.seq}</span></div></div>`).join("");
  }

  /* ---------- 挑选 ---------- */
  function syncPicks() {
    const n = picks.size;
    const b = $("#pickBtn");
    if (b) { b.textContent = `挑选 ${n}`; b.classList.toggle("on", onlyPicks); }
    const po = $("#pickOnlyBtn"); if (po) po.classList.toggle("on", onlyPicks);
    const h = $("#hudPick"); if (h) h.textContent = n;
    document.querySelectorAll("[data-pick]").forEach((el) => el.classList.toggle("on", picks.has(el.dataset.pick)));
    document.querySelectorAll(".asset").forEach((el) => el.classList.toggle("picked", picks.has(el.dataset.id)));
    const mp = $("#mPick");
    if (mp && selected) {
      const on = picks.has(selected.id);
      mp.classList.toggle("on", on);
      mp.textContent = on ? "✓ 已挑选" : "＋ 加入挑选";
    }
  }
  function togglePick(id) {
    if (!id) return;
    const add = !picks.has(id);
    if (add) picks.add(id); else picks.delete(id);
    savePicks();
    if (onlyPicks) renderGrid(); else syncPicks();
    toast(add ? "已加入挑选" : "已移出挑选");
  }
  async function copyText(text, ok) {
    if (!text) { toast("没有可复制的内容"); return; }
    try { await navigator.clipboard.writeText(text); toast(ok); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(ok); } catch (e2) { toast("复制受浏览器限制"); }
      ta.remove();
    }
  }
  function exportPicks() {
    if (!picks.size) { toast("挑选夹还是空的"); return; }
    // 导出也要分开：提示词、译文、补充说明各自成段，不拌在一起
    const md = assets.filter((a) => picks.has(a.id)).map((a) => {
      const alt = altOf(a);
      let s = `## ${a.title}（${a.seq}）\n分类：${a.category} · 模型：${a.model || "通用"}\n\n${a.prompt || ""}`;
      if (alt.text) s += `\n\n### ${alt.label}\n${alt.text}`;
      if (a.note) s += `\n\n### 补充说明（不属于提示词）\n${a.note}`;
      return s;
    }).join("\n\n---\n\n");
    copyText(md, `已复制 ${picks.size} 条挑选的提示词`);
  }

  /* ---------- 详情：看片 + 挑选 ---------- */
  function pool() {
    if (canvasOpen && canvasList.length) return canvasList;   // 展厅里前/后一张按展厅自己的列表翻
    return visible.length ? visible : assets;
  }

  let shots = [], shotIdx = 0;

  function showShot(i) {
    const a = selected;
    if (!a || !shots.length) return;
    shotIdx = ((i % shots.length) + shots.length) % shots.length;
    const s = shots[shotIdx];
    const img = $("#mImg");
    if (!img) return;
    img.src = s.thumb || s.img;                 // 先缩略图秒开
    const hi = new Image();
    hi.onload = () => { if (selected === a && shots[shotIdx] === s) img.src = s.img; };
    hi.src = s.img;                             // 再换完整大图
    img.alt = a.title;
    img.style.maxWidth = `min(100%,${Math.round((s.w || 900) * 1.8)}px)`;
    const size = $("#mSize");
    if (size) size.textContent = (s.w && s.h ? `${s.w}×${s.h}` : "") + (shots.length > 1 ? ` · 示例 ${shotIdx + 1}/${shots.length}` : "");
    const media = img.parentElement;
    if (media) media.classList.toggle("hasShots", shots.length > 1);
    if (lightboxOpen()) { const lbi = $("#lbImg"); if (lbi) lbi.src = s.img; }   // 放大看的时候也能直接换示例图
    const box = $("#mShots");
    if (box) {
      box.classList.toggle("show", shots.length > 1);
      box.innerHTML = shots.length > 1
        ? shots.map((x, k) => `<button class="shotBtn${k === shotIdx ? " on" : ""}" data-shot="${k}" title="示例 ${k + 1}"><img src="${esc(x.thumb)}" alt="" loading="lazy" decoding="async"></button>`).join("")
        : "";
    }
  }

  function renderStrip(p, idx) {
    const strip = $("#mStrip");
    const pv = $("#mPrev"), nx = $("#mNext");   // 只有一条时藏掉翻页箭头，避免点了没反应
    if (pv) pv.hidden = p.length < 2;
    if (nx) nx.hidden = p.length < 2;
    if (!strip) return;
    const from = Math.max(0, idx - 18), to = Math.min(p.length, idx + 19);
    strip.innerHTML = p.slice(from, to).map((a, i) =>
      `<button class="stripItem${from + i === idx ? " on" : ""}" data-id="${esc(a.id)}" title="${esc(a.title)}"><img src="${esc(a.thumb)}" alt="" loading="lazy" decoding="async"></button>`).join("");
    const on = strip.querySelector(".on");
    if (on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2;
  }

  /* 提示词区：原文/译文页签 + 字数 + 独立的补充说明栏（动态插入，不动 index.html） */
  function ensurePromptUI() {
    const info = document.querySelector(".modalInfo");
    if (!info) return;
    const pt = info.querySelector(".promptTitle");
    const pb = document.getElementById("mPrompt");
    if (!pt || !pb) return;
    if (!document.getElementById("mLangTabs")) {
      const tabs = document.createElement("div");
      tabs.id = "mLangTabs";
      tabs.className = "ptabs show";
      tabs.innerHTML = `<button class="pt on" type="button" data-t="o">原文</button><button class="pt" type="button" data-t="z">中文译文</button><span class="pchars" id="mChars"></span>`;
      pt.insertAdjacentElement("afterend", tabs);
      tabs.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = e.target.closest("[data-t]");
        if (b) setLang(b.dataset.t);
      });
    }
    if (!document.getElementById("mNoteWrap")) {
      const w = document.createElement("div");
      w.id = "mNoteWrap";
      w.className = "noteWrap";
      w.innerHTML = `<div class="noteTitle"><b>补充说明</b><span class="noteHint">不属于提示词正文</span><button class="noteCopy" type="button" id="mNoteCopy">复制</button></div><div class="noteBox" id="mNote"></div>`;
      pb.insertAdjacentElement("afterend", w);
      const nc = document.getElementById("mNoteCopy");
      if (nc) nc.addEventListener("click", (e) => {
        e.stopPropagation();
        copyText(selected && selected.note ? String(selected.note) : "", "补充说明已复制");
      });
    }
  }

  function setLang(t) {
    const a = selected;
    const alt = altOf(a);
    if (t === "z" && !alt.text) t = "o";
    promptLang = t;
    const tabs = document.getElementById("mLangTabs");
    if (tabs) tabs.querySelectorAll("[data-t]").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    const pb = document.getElementById("mPrompt");
    if (!pb) return;
    const txt = t === "z" ? alt.text : ((a && a.prompt) || "");
    pb.textContent = txt || "暂未补充提示词";
    pb.classList.toggle("empty", !txt);
    const ch = document.getElementById("mChars");
    if (ch) ch.textContent = txt ? `${txt.length} 字` : "";
    const cp = $("#copy");
    if (cp) cp.title = t === "z" ? `复制${alt.label}（不含补充说明）` : "复制提示词原文（不含补充说明）";
  }

  function detail(id, push = true) {
    const a = byId(id);
    if (!a) return;
    selected = a;
    shots = (a.shots && a.shots.length) ? a.shots : [{ img: a.img, thumb: a.thumb, w: a.w, h: a.h }];
    showShot(0);
    const p = pool();
    const idx = p.findIndex((x) => x.id === a.id);
    const alt = altOf(a);
    $("#mIndex").textContent = `${idx < 0 ? 1 : idx + 1} / ${p.length}`;
    $("#mKicker").textContent = `${a.seq} / ${esc(a.category || "")}`;
    $("#mTitle").textContent = a.title;
    $("#mCat").textContent = a.category;
    $("#mModel").textContent = a.model || "通用";
    $("#mPal").textContent = a.palette || "—";
    $("#mUpdated").textContent = a.updated || "—";
    $("#mTags").innerHTML = (a.tags || []).map((t, i) => `<span class="tag${i === 1 ? " mint" : ""}">${esc(t)}</span>`).join("")
      + (alt.text ? `<span class="tag lang">中英对照</span>` : "");

    // 提示词只放提示词；补充说明另起一栏，不再用一条横线拼在后面
    ensurePromptUI();
    const tabs = document.getElementById("mLangTabs");
    if (tabs) {
      tabs.classList.add("show");
      tabs.classList.toggle("noalt", !alt.text);   // 没有对照版本就只留字数，不出页签
      const ob = tabs.querySelector('[data-t="o"]'), zb = tabs.querySelector('[data-t="z"]');
      if (ob) ob.textContent = "原文 · " + (isCN(a.prompt) ? "中文" : "EN");
      if (zb) zb.textContent = alt.label;
    }
    setLang(alt.text ? promptLang : "o");
    const nw = document.getElementById("mNoteWrap"), nb = document.getElementById("mNote");
    const note = a.note ? String(a.note).trim() : "";
    if (nw) nw.classList.toggle("show", !!note);
    if (nb) nb.textContent = note;

    const info = document.querySelector(".modalInfo");
    if (info) info.scrollTop = 0;               // 换风格时回到顶部，提示词始终在第一屏
    renderStrip(p, idx < 0 ? 0 : idx);
    liftModalAboveCanvas();
    $("#modal").classList.add("show");
    syncPicks();
    if (push) history.replaceState(null, "", `#${a.id}`);
  }
  function openLightbox() {
    const s = shots[shotIdx];
    if (!s) return;
    const lb = $("#lightbox"), im = $("#lbImg");
    if (!lb || !im) return;
    im.src = s.img;
    im.alt = selected ? selected.title : "";
    lb.classList.add("show");
  }

  function lightboxOpen() {
    const lb = $("#lightbox");
    return !!lb && lb.classList.contains("show");
  }

  function closeLightbox() {
    const lb = $("#lightbox");
    if (lb) lb.classList.remove("show");
  }

  function closeDetail() {
    $("#modal").classList.remove("show");
    selected = null;
    history.replaceState(null, "", location.pathname + location.search);
  }
  function step(dir) {
    if (!selected) return;
    const p = pool();
    const i = p.findIndex((x) => x.id === selected.id);
    if (i < 0) return;
    detail(p[(i + dir + p.length) % p.length].id);
  }
  function toast(t) {
    const el = $("#toast");
    el.textContent = t; el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1300);
  }

  /* ---------- 无限画布展厅（球面投影 + 虚拟化） ---------- */
  const canvasEl = () => $("#canvas"), viewport = () => $("#viewport"), sphere = () => $("#sphere");
  const STEP_DEG = 11, TOTAL_COLS = Math.round(360 / STEP_DEG);
  let ROW_HALF = 3, R_SCALE = 1;   // 随展图数量动态调整：图少就少排、挂大一点
  const MIN_Z = 0.55, MAX_Z = 2.4;
  let SPHERE_R = 1700, CELL = 326;
  let camLon = 0, camLat = 0, camZoom = 1;
  let tiltX = 0, tiltY = 0, tiltTX = 0, tiltTY = 0, tiltRunning = false;
  let canvasOpen = false, canvasPool = [], canvasList = [];
  const cells = new Map();

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // 看片台必须盖在画布之上，否则在展厅里点开提示词等于没开
  function liftModalAboveCanvas() {
    const zOf = (el) => {
      if (!el) return 0;
      const v = parseInt(getComputedStyle(el).zIndex, 10);
      return Number.isFinite(v) ? v : 0;
    };
    const base = zOf($("#canvas"));
    if (!base) return;
    [["#modal", 2], ["#lightbox", 3], ["#toast", 4]].forEach(([sel, k]) => {
      const el = $(sel);
      if (el && zOf(el) <= base) el.style.zIndex = String(base + k);
    });
  }

  function sizeSphere() {
    SPHERE_R = Math.round((window.innerWidth < 760 ? 1120 : 1700) * R_SCALE);
    CELL = Math.round(SPHERE_R * STEP_DEG * Math.PI / 180);
    document.documentElement.style.setProperty("--cell", CELL + "px");
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function coprime(from, n) {
    if (n < 2) return 1;
    for (let s = Math.max(1, from), i = 0; i < n + 2; i++, s++) if (gcd(s, n) === 1) return s;
    return 1;
  }
  let strideC = 7, strideR = 13;

  function itemFor(col, row) {
    const n = canvasPool.length;
    if (!n) return null;
    // 用真实列号（不按 TOTAL_COLS 取模）：取模会在接缝处打断行内的等差递进，反而造成同屏重复
    const r = row + ROW_HALF;
    return canvasPool[(((col * strideC + r * strideR) % n) + n) % n];
  }

  function ensureCell(col, row) {
    const key = col + "," + row;
    let el = cells.get(key);
    if (el) return el;
    const a = itemFor(col, row);
    if (!a) return null;
    el = document.createElement("div");
    el.className = "work";
    el.dataset.id = a.id;
    el.innerHTML = `<div class="workIn">
      <div class="wHead"><span>${esc((a.category || "").replace("——模板", "").replace("（收集）", ""))}</span><span>${a.seq}</span></div>
      <div class="wPic"><img src="${esc(a.thumb)}" alt="${esc(a.title)}" loading="lazy" decoding="async"></div>
      <div class="wFoot"><span class="wTitle">${esc(a.title)}</span><span class="wModel">${esc(a.model || "通用")}</span></div>
      <span class="wPick${picks.has(a.id) ? " on" : ""}" data-pick="${a.id}" title="加入挑选">✓</span>
      <span class="wHint">点击看提示词</span>
    </div>`;
    sphere().appendChild(el);
    cells.set(key, el);
    return el;
  }

  function placeCell(el, col, row) {
    const lon = col * STEP_DEG - camLon;
    const y = (row * STEP_DEG - camLat) / STEP_DEG * CELL;
    el.style.transform = `rotateY(${-lon}deg) translateZ(${-SPHERE_R}px) translateY(${y}px) scale(1.006)`;
  }

  function renderSphere() {
    if (!canvasPool.length) { cells.forEach((el) => el.remove()); cells.clear(); return; }
    const halfH = (Math.atan2(window.innerWidth / 2, 1500) * 180 / Math.PI) / camZoom + STEP_DEG;
    const halfV = (Math.atan2(window.innerHeight / 2, 1500) * 180 / Math.PI) / camZoom + STEP_DEG;
    const c0 = Math.floor((camLon - halfH) / STEP_DEG), c1 = Math.ceil((camLon + halfH) / STEP_DEG);
    const r0 = Math.max(-ROW_HALF, Math.floor((camLat - halfV) / STEP_DEG));
    const r1 = Math.min(ROW_HALF, Math.ceil((camLat + halfV) / STEP_DEG));
    const need = new Set();
    for (let col = c0; col <= c1; col++) {
      for (let row = r0; row <= r1; row++) {
        const key = col + "," + row;
        need.add(key);
        const el = ensureCell(col, row);
        if (el) placeCell(el, col, row);
      }
    }
    for (const [key, el] of cells) if (!need.has(key)) { el.remove(); cells.delete(key); }
    sphere().style.transform = `translate(-50%,-50%) rotateY(${tiltY}deg) rotateX(${tiltX}deg) scale(${camZoom})`;
    const pos = $("#pos"), zm = $("#zoom");
    if (pos) pos.textContent = `${Math.round(((camLon % 360) + 360) % 360)}°, ${Math.round(camLat)}°`;
    if (zm) zm.textContent = camZoom.toFixed(2) + "×";
  }

  function rebuildCanvas() {
    canvasList = list({ ignoreCat: true });   // 展厅永远铺全部，不跟网格库的分类走
    canvasPool = [];
    canvasList.forEach((a) => {
      const ss = (a.shots && a.shots.length) ? a.shots : [{ thumb: a.thumb }];
      ss.forEach((s) => canvasPool.push({ id: a.id, seq: a.seq, title: a.title, category: a.category, model: a.model, thumb: s.thumb }));
    });
    cells.forEach((el) => el.remove());
    cells.clear();
    // 排数：先按库容量给基准，再保证至少铺满一屏高（竖屏手机否则上下留大片空黑）
    const n = canvasPool.length;
    R_SCALE = 1;
    sizeSphere();
    const rowsFill = Math.max(1, Math.ceil(window.innerHeight / CELL));
    ROW_HALF = Math.max(n >= 330 ? 6 : n >= 150 ? 3 : 1, Math.ceil((rowsFill - 1) / 2));
    camLat = clamp(camLat, -ROW_HALF * STEP_DEG, ROW_HALF * STEP_DEG);
    // 同屏尽量不重复：行内按 strideC 递进，换行时正好跳过“一屏的列数”，把下一批图接上
    strideC = coprime(7, n);
    const colsView = 2 * Math.ceil(((Math.atan2(window.innerWidth / 2, 1500) * 180 / Math.PI) + STEP_DEG) / STEP_DEG) + 1;
    const rowJump = colsView * strideC + Math.floor(colsView / 2);   // 半屏错位：否则库小时第 3 排会与第 1 排逐格重叠，整排重复比零星重复刺眼
    strideR = n > 1 ? ((rowJump % n) || 1) : 1;
    const sub = $("#canvasSub");
    if (sub) sub.textContent = canvasPool.length
      ? `全部资产 · ${canvasList.length} 条风格 / ${canvasPool.length} 张展图 · 拖拽旋转 · 滚轮缩放 · 点击看提示词`
      : (onlyPicks ? "挑选夹还是空的" : "没有符合搜索条件的展品");
    const empty = $("#canvasEmpty");
    if (empty) {
      empty.textContent = onlyPicks
        ? "挑选夹还是空的 —— 在展板右上角点 ✓ 先收几件"
        : "没有符合当前搜索的展品 —— 清空搜索框试试";
      empty.classList.toggle("show", !canvasPool.length);
    }
    renderSphere();
  }

  function recenter() { camLon = 0; camLat = 0; camZoom = 1; renderSphere(); }
  function zoomBy(k) { camZoom = clamp(camZoom * k, MIN_Z, MAX_Z); renderSphere(); }

  function openCanvas() {
    showLib();
    canvasEl().classList.add("show");
    canvasOpen = true;
    liftModalAboveCanvas();
    sizeSphere();
    rebuildCanvas();
    requestAnimationFrame(renderSphere);
  }
  function closeCanvas() {
    canvasEl().classList.remove("show");
    canvasOpen = false;
    cells.forEach((el) => el.remove());
    cells.clear();
  }

  function initReveal() {
    const targets = document.querySelectorAll(".reveal");
    targets.forEach((el, i) => el.style.setProperty("--reveal-delay", `${Math.min(i * 28, 140)}ms`));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => es.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      }), { root: $("#cover"), rootMargin: "0px 0px 28% 0px", threshold: 0.04 });
      targets.forEach((el) => io.observe(el));
    } else targets.forEach((el) => el.classList.add("in"));
  }

  /* ---------- 布局修补（分类 UI 复位 + 看片台提示词可见 + 中英切换） ---------- */
  const FIX_CSS = `
/* 看片台：信息栏自己滚动，提示词跟在标题下面并撑满剩余空间 */
.modalInfo{display:flex;flex-direction:column;min-height:0;overflow:auto;overscroll-behavior:contain}
.modalInfo>*{flex:0 0 auto}
.modalInfo>.promptBox{flex:1 1 auto;max-height:none;min-height:132px}
.modalMedia{overflow:hidden}
@media (max-width:760px){
  .modalCard{grid-template-columns:1fr;grid-template-rows:minmax(110px,.82fr) minmax(0,1.18fr) auto;max-height:93svh}
  .modalMedia{max-height:none;min-height:0;padding:12px}
  .modalInfo{padding:16px 16px 18px}
  .modalInfo h2{font-size:23px;margin:6px 44px 8px 0}
  .promptTitle{margin:12px 0 7px}
  .promptTitle .hint{display:none}
  .specs{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:12px 0 0}
  .spec{padding:7px 9px}
  .spec b{font-size:12px}
}
/* 提示词：原文 / 译文页签 + 字数 */
.ptabs{display:none;align-items:center;gap:6px;margin:0 0 8px;flex-wrap:wrap}
.ptabs.show{display:flex}
.pt{appearance:none;-webkit-appearance:none;border:1px solid rgba(17,16,13,.16);background:transparent;color:#6b6152;font:inherit;font-size:11.5px;letter-spacing:.02em;line-height:1.5;padding:4px 11px;border-radius:999px;cursor:pointer}
.pt:hover{background:rgba(17,16,13,.05)}
.pt.on{background:#11100d;border-color:#11100d;color:#fbf9f4}
.ptabs.noalt .pt{display:none}
.pchars{margin-left:auto;font-size:10.5px;letter-spacing:.04em;color:#9a9182;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;flex:0 0 auto}
.promptBox.empty{color:#9a9182;font-style:italic}
/* 补充说明：与提示词彻底分家，不进复制 */
.noteWrap{display:none;margin:14px 0 0}
.noteWrap.show{display:block}
.noteTitle{display:flex;align-items:center;gap:8px;margin:0 0 6px}
.noteTitle b{font-size:11.5px;letter-spacing:.08em;color:#51493b;font-weight:600}
.noteHint{font-size:10.5px;color:#9a9182;flex:1 1 auto}
.noteCopy{appearance:none;-webkit-appearance:none;border:1px solid rgba(17,16,13,.16);background:transparent;color:#6b6152;font:inherit;font-size:11px;line-height:1.5;padding:3px 10px;border-radius:999px;cursor:pointer;flex:0 0 auto}
.noteCopy:hover{background:rgba(17,16,13,.05)}
.noteBox{white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.72;color:#51493b;background:rgba(17,16,13,.035);border-left:2px solid rgba(17,16,13,.2);border-radius:0 8px 8px 0;padding:10px 12px;max-height:210px;overflow:auto}
.tag.lang{background:rgba(23,63,232,.1);color:#173fe8}
/* 分类（只在网格库）：侧栏两级 + 900~1100px 之间也要有胶囊 */
@media (max-width:1100px){ .catChips{display:flex} }
.canvasChips{display:none !important}
.catGroup{margin:0 0 2px}
.catSubs{display:none}
.catGroup.open .catSubs{display:block;margin:2px 0 10px 14px;padding-left:10px;border-left:1px solid rgba(17,16,13,.16)}
/* 大类右下角的小箭头：合起来朝下，展开后朝上，一眼看出还能再点一次 */
.cat.catKind{position:relative}
.cat.catKind::after{content:"";position:absolute;right:15px;bottom:13px;width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(45deg);opacity:.4;transition:transform .2s ease,opacity .2s ease;pointer-events:none}
.catGroup.open>.cat.catKind::after{transform:rotate(-135deg);opacity:.75}
.catSub{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;margin:2px 0;border:0;background:transparent;border-radius:9px;cursor:pointer;text-align:left;font:inherit;color:#51493b}
.catSub b{font-weight:600;font-size:12.5px}
.catSub i{font-style:normal;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#8a7d63}
.catSub:hover{background:rgba(17,16,13,.055)}
.catSub.active{background:rgba(23,63,232,.1);color:#173fe8}
.catSub.active i{color:#173fe8}
.chip i{font-style:normal;opacity:.5;font-size:.86em;margin-left:3px}
.chip.sub{border-style:dashed}
.chip.clearAll{border-style:dashed;opacity:.8}
.chipSep{display:inline-flex;align-items:center;padding:0 1px;color:#8a7d63;font-size:12px;flex:0 0 auto}
/* 图片没加载出来时给个说明，不要留一块灰底 */
.imgFail{position:relative}
.imgFail img{opacity:0}
.imgFail::after{content:"图片缺失";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;letter-spacing:.08em;color:#9a9182;background:repeating-linear-gradient(45deg,rgba(17,16,13,.045) 0 8px,transparent 8px 16px)}
/* 键盘可达性 */
.asset:focus-visible,.cat:focus-visible,.catSub:focus-visible,.chip:focus-visible,.pt:focus-visible,.noteCopy:focus-visible,.stripItem:focus-visible,.shotBtn:focus-visible,.openingCard:focus-visible{outline:2px solid #173fe8;outline-offset:2px}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}
}
`;

  function applyLayoutFixes() {
    if (!document.getElementById("salFix")) {
      const st = document.createElement("style");
      st.id = "salFix";
      st.textContent = FIX_CSS;
      document.head.appendChild(st);
    }
    // 网格库恢复分类；展厅（无限画布）保持「只有全部」，不放分类胶囊
    [".side", "#catChips"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el && el.style.display === "none") el.style.display = "";
    });
    const cc = $("#canvasChips");
    if (cc) { cc.style.display = "none"; cc.innerHTML = ""; }
    liftModalAboveCanvas();
    // 无障碍：看片台是对话框，toast 要能被读屏播报
    const md = $("#modal");
    if (md) { md.setAttribute("role", "dialog"); md.setAttribute("aria-modal", "true"); md.setAttribute("aria-label", "看片台"); }
    const ts = $("#toast");
    if (ts) { ts.setAttribute("role", "status"); ts.setAttribute("aria-live", "polite"); }
    const sb = $("#search");
    if (sb) sb.setAttribute("aria-label", "搜索标题、标签、提示词原文与中文译文");
    // 提示词块上移到标题/按钮下面，规格卡片挪到最后
    const info = document.querySelector(".modalInfo");
    if (info) {
      const specs = info.querySelector(".specs");
      const pt = info.querySelector(".promptTitle");
      const pb = document.getElementById("mPrompt");
      if (specs && pt && pb && pt.compareDocumentPosition(specs) & Node.DOCUMENT_POSITION_PRECEDING) {
        info.insertBefore(pt, specs);
        info.insertBefore(pb, specs);
      }
    }
    ensurePromptUI();   // 页签与补充说明栏要在搜完位置之后插
  }

  function bindCanvas() {
    const vp = viewport();
    const pointers = new Map();
    let down = false, sx = 0, sy = 0, oLon = 0, oLat = 0, dragged = 0;
    let vx = 0, vy = 0, lastX = 0, lastY = 0, lastT = 0, pinch = 0;
    let downEl = null, pinched = false;
    const SENS = STEP_DEG / 80;
    const LAT_MIN = () => -ROW_HALF * STEP_DEG, LAT_MAX = () => ROW_HALF * STEP_DEG;

    // vp 调了 setPointerCapture，浏览器会把后续的 click 重定向到 vp 本身，
    // 于是全局的 closest("[data-id]") 永远拿不到展板——展厅的点击在这里自己结算
    function tapAt(el) {
      if (!el || !el.closest) return;
      const pk = el.closest("[data-pick]");
      if (pk) { togglePick(pk.dataset.pick); return; }
      const w = el.closest("[data-id]");
      if (w) detail(w.dataset.id);
    }

    const start = (x, y) => {
      down = true; sx = x; sy = y; oLon = camLon; oLat = camLat;
      lastX = x; lastY = y; lastT = performance.now();
      vx = vy = 0; dragged = 0; moved = false;
      vp.classList.add("dragging");
    };
    const move = (x, y) => {
      if (!down) return;
      camLon = oLon - (x - sx) * SENS / camZoom;
      camLat = clamp(oLat + (y - sy) * SENS / camZoom, LAT_MIN(), LAT_MAX());
      dragged += Math.abs(x - lastX) + Math.abs(y - lastY);
      if (dragged > 8) moved = true;
      const now = performance.now(), dt = Math.max(1, now - lastT);
      vx = (x - lastX) / dt; vy = (y - lastY) / dt;
      lastX = x; lastY = y; lastT = now;
      renderSphere();
    };
    const end = () => {
      if (!down) return;
      down = false;
      vp.classList.remove("dragging");
      const decay = 0.93, minV = 0.02;
      const glide = () => {
        if (Math.abs(vx) < minV && Math.abs(vy) < minV) return;
        camLon -= vx * 16 * SENS / camZoom;
        camLat = clamp(camLat + vy * 16 * SENS / camZoom, LAT_MIN(), LAT_MAX());
        vx *= decay; vy *= decay;
        renderSphere();
        requestAnimationFrame(glide);
      };
      requestAnimationFrame(glide);
      setTimeout(() => { moved = false; }, 60);
    };

    vp.addEventListener("pointerdown", (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        downEl = e.target;
        start(e.clientX, e.clientY);
        vp.setPointerCapture(e.pointerId);
      } else if (pointers.size === 2) {
        down = false; moved = true; pinched = true;
        const [p1, p2] = [...pointers.values()];
        pinch = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      }
    });
    vp.addEventListener("pointermove", (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        zoomBy(d / pinch);
        pinch = d;
        return;
      }
      if (down) { move(e.clientX, e.clientY); return; }
      if (!canvasOpen) return;
      tiltTY = (e.clientX / window.innerWidth - 0.5) * 2 * 5;
      tiltTX = -(e.clientY / window.innerHeight - 0.5) * 2 * 3.5;
      if (!tiltRunning) { tiltRunning = true; requestAnimationFrame(tick); }
    });
    const finish = (e, allowTap) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      const wasDrag = dragged > 8 || pinched;
      const el = downEl;
      end();
      if (!pointers.size) {
        down = false; dragged = 0; downEl = null;
        vp.classList.remove("dragging");
        if (allowTap && !wasDrag) tapAt(el);
        pinched = false;
        setTimeout(() => { moved = false; }, 60);
      }
    };
    vp.addEventListener("pointerup", (e) => finish(e, true));
    vp.addEventListener("pointercancel", (e) => finish(e, false));
    vp.addEventListener("pointerleave", (e) => { if (down) finish(e, false); });

    function tick() {
      tiltY += (tiltTY - tiltY) * 0.08;
      tiltX += (tiltTX - tiltX) * 0.08;
      renderSphere();
      if (Math.abs(tiltTY - tiltY) > 0.02 || Math.abs(tiltTX - tiltX) > 0.02) requestAnimationFrame(tick);
      else tiltRunning = false;
    }

    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const trackpad = (Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY)) || Math.abs(e.deltaX) > 0;
      if (e.ctrlKey || e.metaKey || !trackpad) {
        camZoom = clamp(camZoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), MIN_Z, MAX_Z);
      } else {
        camLon += e.deltaX * SENS / camZoom;
        camLat = clamp(camLat + e.deltaY * SENS / camZoom, LAT_MIN(), LAT_MAX());
      }
      renderSphere();
    }, { passive: false });

    window.addEventListener("resize", () => { if (canvasOpen) { sizeSphere(); renderSphere(); } });
  }

  function bind() {
    // 图片 404 时给容器打标记，显示「图片缺失」而不是一块灰底
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (!img || img.tagName !== "IMG") return;
      const box = img.closest(".assetImg,.wPic,.openingCard,.smallFeature,.stripItem,.shotBtn,.modalMedia");
      if (box) box.classList.add("imgFail");
    }, true);
    ["#enter", "#enter2", "#enter3"].forEach((s) => ($(s).onclick = showLib));
    $$("#homeBtn").onclick = showCover;
    ["#canvasBtn", "#canvasFromCover", "#canvasFromCover2"].forEach((s) => ($(s).onclick = openCanvas));
    $$("#exitCanvas").onclick = closeCanvas;
    $$("#resetBtn").onclick = recenter;
    $$("#zoomIn").onclick = () => zoomBy(1.18);
    $$("#zoomOut").onclick = () => zoomBy(0.85);
    $$("#pickBtn").onclick = () => { onlyPicks = !onlyPicks; renderGrid(); };
    $$("#pickOnlyBtn").onclick = () => { onlyPicks = !onlyPicks; renderGrid(); };
    $$("#exportBtn").onclick = exportPicks;
    $$("#mPick").onclick = (e) => { e.stopPropagation(); if (selected) togglePick(selected.id); };
    $$("#search").oninput = (e) => { q = e.target.value; renderGrid(); };
    $$("#catList").onclick = (e) => { const b = e.target.closest("[data-cat]"); if (b) pickCat(b.dataset.cat); };
    $$("#filterBar").onclick = (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      if (b.dataset.clear) { clearAllFilters(); return; }
      const m = b.dataset.model;
      if (!m) return;
      model = (model === m && m !== "ALL") ? "ALL" : m;   // 再点一次取消这个模型筛选
      renderFilters(); renderGrid();
    };
    $$("#catChips").onclick = (e) => { const b = e.target.closest("[data-cat]"); if (b) pickCat(b.dataset.cat); };
    $$("#mPrev").onclick = (e) => { e.stopPropagation(); step(-1); };
    $$("#mNext").onclick = (e) => { e.stopPropagation(); step(1); };
    $$("#close").onclick = closeDetail;
    $$("#mImg").onclick = openLightbox;
    $$("#lightbox").onclick = closeLightbox;
    $$("#mShots").onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest("[data-shot]");
      if (b) showShot(Number(b.dataset.shot));
    };
    $$("#modal").onclick = (e) => { if (e.target.id === "modal") closeDetail(); };
    // 复制跟随当前页签，并且永远不带补充说明
    $$("#copy").onclick = () => {
      if (!selected) return;
      const alt = altOf(selected);
      const zh = promptLang === "z" && alt.text;
      copyText(zh ? alt.text : (selected.prompt || ""), zh ? `${alt.label}已复制` : "Prompt 已复制");
    };

    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("#canvas")) return;   // 展厅的点击在 pointerup 里处理
      const p = e.target.closest("[data-pick]");
      if (p) { e.preventDefault(); e.stopPropagation(); togglePick(p.dataset.pick); return; }
      if (e.target.closest("[data-cat]")) return;
      if (e.target.closest("[data-t]")) return;   // 中英切换不算选中卡片
      const c = e.target.closest("[data-id]");
      if (c && !moved) detail(c.dataset.id);
    });

    bindCanvas();

    document.addEventListener("keydown", (e) => {
      const t = e.target;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const open = $("#modal").classList.contains("show");
      if (typing) {
        // 搜索框里按 Esc：先清空关键词，已经空了才失焦
        if (e.key === "Escape") {
          if (t.id === "search" && t.value) { t.value = ""; q = ""; renderGrid(); return; }
          t.blur();
          if (open) closeDetail();
        }
        return;
      }
      if (e.key === "/" && !open) { e.preventDefault(); showLib(); $("#search").focus(); }
      if (e.key === "Escape") { if (lightboxOpen()) closeLightbox(); else if (open) closeDetail(); else closeCanvas(); }
      if (open && e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (open && e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (open && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        if (shots.length > 1) showShot(shotIdx + d); else step(d);
      }
      // L 切换原文 / 译文
      if (open && (e.key === "l" || e.key === "L")) { e.preventDefault(); setLang(promptLang === "o" ? "z" : "o"); }
      if (open && (e.key === "c" || e.key === "C")) { e.preventDefault(); const b = $("#copy"); if (b) b.click(); }
      if (open && (e.key === "f" || e.key === "F")) { if (selected) togglePick(selected.id); }
      if (!open && canvasOpen && (e.key === "0" || e.key === "r" || e.key === "R")) recenter();
      if (e.key === "Enter" && !$("#library").classList.contains("show")) showLib();
    });
  }

  async function boot() {
    try {
      const inline = document.getElementById("data");   // offline single-file build
      const d = inline
        ? JSON.parse(inline.textContent)
        : await (await fetch("data/styles.json", { cache: "no-cache" })).json();
      assets = d.assets; categories = d.cats || []; heroIds = d.hero || [];
      if (!Array.isArray(assets)) throw new Error("bad");
      await loadI18n();   // 译文 / 补充说明覆盖层，拿不到也不影响主流程
      const liveIds = new Set(assets.map((a) => a.id));
      let pruned = false;
      [...picks].forEach((id) => { if (!liveIds.has(id)) { picks.delete(id); pruned = true; } });
      if (pruned) savePicks();
      if (!assets.length) {
        const b = $("#boot");
        b.textContent = "库还是空的 —— 用 scripts/ingest.py 导入第一批图片和提示词";
        b.classList.remove("hide");
        const c = $("#countAll"); if (c) c.textContent = "0";
        return;
      }
      buildCatTree();
    } catch (err) {
      $("#boot").textContent = "数据载入失败：请通过 http(s) 打开本页（本地可运行 python3 -m http.server）";
      return;
    }
    applyLayoutFixes();
    initOpening(); renderHeroContent(); renderCats(); renderFilters(); renderCatChips(); renderGrid(); initReveal(); bind();
    document.addEventListener("load", (e) => {
      if (e.target.tagName === "IMG") e.target.classList.add("ready");
    }, true);
    $("#boot").classList.add("hide");
    const hash = location.hash.replace("#", "").trim();
    if (hash && byId(hash)) { showLib(); detail(hash, false); }
  }

  boot();
})();

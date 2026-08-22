/* 风格资产库 — 静态站点前端
   数据: data/styles.json   图片: assets/thumb (列表/画布) + assets/full (详情) */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelector(s) || document.createElement("div");
  const esc = (s) =>
    String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  let assets = [], categories = [], heroIds = [];
  let current = "ALL", model = "ALL", q = "", selected = null, visible = [];
  let onlyPicks = false, moved = false;

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

  /* ---------- filtering ---------- */
  function list() {
    const qq = q.trim().toLowerCase();
    return assets.filter((a) => {
      if (onlyPicks && !picks.has(a.id)) return false;
      if (current !== "ALL" && a.category !== current) return false;
      if (model !== "ALL" && a.model !== model) return false;
      if (!qq) return true;
      return [a.title, a.category, a.kind, a.tone, a.model, a.palette, a.prompt, (a.tags || []).join(" ")]
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
    <div class="tags">${(a.tags || []).slice(0, 2).map((t, i) => `<span class="tag${i ? " mint" : ""}">${esc(t)}</span>`).join("")}</div>
  </button>`;

  function renderGrid() {
    visible = list();
    $("#listTitle").textContent = onlyPicks ? "我的挑选" : current === "ALL" ? "全部资产" : current;
    $("#listSub").textContent = `${visible.length} 个结果 · 点击卡片看大图与提示词，右上角 ✓ 加入挑选`;
    $("#grid").innerHTML = visible.length
      ? visible.map(card).join("")
      : `<p class="emptyState">${onlyPicks ? "挑选夹还是空的，先去卡片右上角点 ✓。" : "没有匹配的资产，换个关键词或清空筛选试试。"}</p>`;
    if (canvasOpen) rebuildCanvas();
    syncPicks();
  }

  function renderFilters() {
    const models = [...new Set(assets.map((a) => a.model).filter(Boolean))].sort();
    $("#filterBar").innerHTML =
      `<button class="chip${model === "ALL" ? " on" : ""}" data-model="ALL">全部模型</button>` +
      models.map((m) => `<button class="chip${model === m ? " on" : ""}" data-model="${esc(m)}">${esc(m)}</button>`).join("");
  }

  function renderCatChips() {
    const chips = [{ name: "ALL", label: "全部资产" }].concat(categories.map((c) => ({ name: c.name, label: c.name })));
    const html = chips
      .map((c) => `<button class="chip${current === c.name ? " on" : ""}" data-cat="${esc(c.name)}">${esc(c.label)}</button>`)
      .join("");
    $("#catChips").innerHTML = html;
    $("#canvasChips").innerHTML = html;
  }

  function setCat(cat) {
    current = cat;
    document.querySelectorAll(".cat").forEach((x) => x.classList.toggle("active", x.dataset.cat === cat));
    renderCatChips();
    renderGrid();
  }

  function renderCats() {
    $("#catList").innerHTML =
      `<button class="cat active" data-cat="ALL"><b>全部资产</b><span>ALL ASSETS</span><i>${assets.length}</i></button>` +
      categories.map((c) => `<button class="cat" data-cat="${esc(c.name)}"><b>${esc(c.name)}</b><span>${esc(c.tone)}</span><i>${c.count}</i></button>`).join("");
  }

  function byId(id) { return assets.find((x) => x.id === id); }

  function initOpening() {
    const heroAssets = heroIds.map(byId).filter(Boolean);
    $("#openingCollage").innerHTML = heroAssets.slice(0, 5).map((a, i) =>
      `<button class="openingCard c${i + 1}" data-id="${esc(a.id)}"><img src="${esc(a.thumb)}" alt="${esc(a.title)}" loading="eager" decoding="async"><b>${esc(a.title)} · ${a.seq}</b></button>`).join("");
    $("#countAll").textContent = assets.length;
    const cc = $("#countCats"); if (cc) cc.textContent = categories.length;
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
    const wide = assets[21] || assets[0];
    const wideImg = $("#wideImg");
    wideImg.src = wide.thumb; wideImg.alt = wide.title; wideImg.loading = "lazy"; wideImg.decoding = "async";
    const small = [assets[35], assets[52], assets[75]].filter(Boolean);
    $("#smallFeatures").innerHTML = small.map((a, i) =>
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
    const md = assets.filter((a) => picks.has(a.id)).map((a) =>
      `## ${a.title}（${a.seq}）\n分类：${a.category} · 模型：${a.model || "通用"}\n\n${a.prompt || ""}`).join("\n\n---\n\n");
    copyText(md, `已复制 ${picks.size} 条挑选的提示词`);
  }

  /* ---------- 详情：看片 + 挑选 ---------- */
  function pool() { return visible.length ? visible : assets; }

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

  function detail(id, push = true) {
    const a = byId(id);
    if (!a) return;
    selected = a;
    shots = (a.shots && a.shots.length) ? a.shots : [{ img: a.img, thumb: a.thumb, w: a.w, h: a.h }];
    showShot(0);
    const p = pool();
    const idx = p.findIndex((x) => x.id === a.id);
    $("#mIndex").textContent = `${idx < 0 ? 1 : idx + 1} / ${p.length}`;
    $("#mKicker").textContent = `${a.seq} / ${esc(a.category || "")}`;
    $("#mTitle").textContent = a.title;
    $("#mCat").textContent = a.category;
    $("#mModel").textContent = a.model || "通用";
    $("#mPal").textContent = a.palette || "—";
    $("#mUpdated").textContent = a.updated || "—";
    $("#mTags").innerHTML = (a.tags || []).map((t, i) => `<span class="tag${i === 1 ? " mint" : ""}">${esc(t)}</span>`).join("");
    $("#mPrompt").textContent = [a.prompt, a.note].filter(Boolean).join("\n\n———\n\n") || "暂未补充提示词";
    renderStrip(p, idx < 0 ? 0 : idx);
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
  let canvasOpen = false, canvasPool = [];
  const cells = new Map();

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
    if (!canvasPool.length) return;
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
    canvasPool = [];
    (visible || []).forEach((a) => {
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
      ? `${canvasPool.length} 张展图 · 拖拽旋转 · 滚轮缩放 · 点击看提示词`
      : (onlyPicks ? "挑选夹还是空的" : "没有符合条件的展品");
    const empty = $("#canvasEmpty");
    if (empty) {
      empty.textContent = onlyPicks
        ? "挑选夹还是空的 —— 在展板右上角点 ✓ 先收几件"
        : "没有符合当前筛选的展品 —— 换个分类或关键词";
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

  function bindCanvas() {
    const vp = viewport();
    const pointers = new Map();
    let down = false, sx = 0, sy = 0, oLon = 0, oLat = 0, dragged = 0;
    let vx = 0, vy = 0, lastX = 0, lastY = 0, lastT = 0, pinch = 0;
    const SENS = STEP_DEG / 80;
    const LAT_MIN = () => -ROW_HALF * STEP_DEG, LAT_MAX = () => ROW_HALF * STEP_DEG;

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
      if (pointers.size === 1) { start(e.clientX, e.clientY); vp.setPointerCapture(e.pointerId); }
      else if (pointers.size === 2) {
        down = false; moved = true;
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
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      end();
      if (!pointers.size) {
        down = false; dragged = 0;
        vp.classList.remove("dragging");
        setTimeout(() => { moved = false; }, 60);
      }
    };
    vp.addEventListener("pointerup", release);
    vp.addEventListener("pointercancel", release);
    vp.addEventListener("pointerleave", (e) => { if (down) release(e); });

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
    // 图片 404 时���容器打标记，显示「图片缺失」而不是一块灰底
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
    $$("#catList").onclick = (e) => { const b = e.target.closest(".cat"); if (b) setCat(b.dataset.cat); };
    $$("#filterBar").onclick = (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      model = b.dataset.model; renderFilters(); renderGrid();
    };
    $$("#catChips").onclick = (e) => { const b = e.target.closest(".chip"); if (b) setCat(b.dataset.cat); };
    $$("#canvasChips").onclick = (e) => { const b = e.target.closest(".chip"); if (b) setCat(b.dataset.cat); };
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
    $$("#copy").onclick = () => copyText(selected?.prompt || "", "Prompt 已复制");

    document.addEventListener("click", (e) => {
      const p = e.target.closest("[data-pick]");
      if (p) { e.preventDefault(); e.stopPropagation(); togglePick(p.dataset.pick); return; }
      const c = e.target.closest("[data-id]");
      if (c && !moved) detail(c.dataset.id);
    });

    bindCanvas();

    document.addEventListener("keydown", (e) => {
      const t = e.target;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const open = $("#modal").classList.contains("show");
      if (typing) { if (e.key === "Escape") { t.blur(); if (open) closeDetail(); } return; }
      if (e.key === "/" && !open) { e.preventDefault(); showLib(); $("#search").focus(); }
      if (e.key === "Escape") { if (lightboxOpen()) closeLightbox(); else if (open) closeDetail(); else closeCanvas(); }
      if (open && e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (open && e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (open && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        if (shots.length > 1) showShot(shotIdx + d); else step(d);
      }
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
    } catch (err) {
      $("#boot").textContent = "数据载入失败：请通过 http(s) 打开本页（本地可运行 python3 -m http.server）";
      return;
    }
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

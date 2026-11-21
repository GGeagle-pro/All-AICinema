/* All AI-Cinema – 관리자 페이지
 *
 * 동작 방식
 *  - 이 사이트는 서버 프로그램이 없는 정적 사이트라, 관리자 기능은 GitHub 저장소의 파일을 GitHub API 로 직접 고칩니다.
 *      channels.json          : 채널·직접 추가 영상·숨김 목록 → 저장하면 영상 자동 수집 후 사이트 배포
 *      public/data/site.json  : 메뉴·광고 배너·애드센스 설정 → 저장하면 바로 사이트 배포
 *      public/uploads/        : 배너 이미지
 *  - 저장 후 화면 위쪽에 "사이트 반영" 진행 상황을 보여줍니다.
 *
 * 보안
 *  - 로그인 = GitHub 토큰(이 저장소 Contents 읽기/쓰기만 허용된 fine-grained 토큰 권장)
 *  - 토큰은 이 브라우저에만 저장(sessionStorage, "로그인 유지" 시 localStorage)되고 api.github.com 에만 보냅니다.
 *  - 화면에 넣는 모든 글자는 textContent 로만 넣어 스크립트로 실행되지 않습니다.
 *  - 배너 이미지는 브라우저에서 다시 그려(WebP 변환) 이미지 외의 숨은 내용이 올라가지 않게 합니다. SVG 는 받지 않습니다.
 *  - 배너 링크는 http(s) 주소만 허용합니다.
 */
(() => {
  "use strict";

  const API = "https://api.github.com";
  const CONFIG = "channels.json";
  const SITE = "public/data/site.json";
  const UPLOADS = "public/uploads";
  const BRANCH = "main";
  const KEY = "asa-admin";
  const PAGE = 60;
  const VALID_ID = /^[\w-]{11}$/;
  const REPO_RE = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
  const SLOT_KEYS = [
    ["top", "상단 배너", "모든 화면 맨 위 (가로형)"],
    ["bottom", "하단 배너", "모든 화면 맨 아래 (가로형)"],
    ["left", "왼쪽 세로 배너", "PC 전용 · 160×600 · 비워두면 오른쪽 번호를 같이 사용"],
    ["right", "오른쪽 세로 배너", "PC 전용 · 160×600 · 비워두면 왼쪽 번호를 같이 사용"],
    ["feed", "목록 사이", "아래 '목록 사이 광고 간격'마다 1개 (반응형)"],
    ["player", "플레이어 아래", "영상 재생 화면"],
  ];

  // 다른 사이트가 이 페이지를 iframe 에 넣지 못하게
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  const $ = (s) => document.querySelector(s);
  const state = {
    auth: null, user: "",
    config: null,          // channels.json
    site: null,            // site.json
    data: null, videos: [],
    pending: new Set(),    // 방금 숨겨서 사이트 반영을 기다리는 영상
    ch: "", q: "", shown: 0, selected: new Set(),
    busy: false,
    addCats: new Set(),
    menuDraft: null,
    bannerFiles: [null, null, null],
  };

  // ───────── 화면 요소 만들기 (textContent 만 사용) ─────────
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(n.dataset, v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }
  const thumb = (id) => (VALID_ID.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "");
  const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    if (!Number.isFinite(s)) return "";
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    if (s < 2592000) return Math.floor(s / 86400) + "일 전";
    if (s < 31536000) return Math.floor(s / 2592000) + "개월 전";
    return Math.floor(s / 31536000) + "년 전";
  };
  const fmtViews = (n) => (!n ? "" : n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, "") + "만회" : n.toLocaleString("ko-KR") + "회");
  const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").trim().slice(0, max);
  const SAFE_IMG = /^uploads\/[\w.-]{1,80}\.(webp|png|jpe?g|gif)$/i;
  const safeLink = (u) => {
    if (!u) return "";
    try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; }
  };

  let toastTimer;
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("err", err);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), err ? 7000 : 4500);
  }

  // ───────── 로그인 정보 저장 (이 브라우저에만) ─────────
  const store = {
    load() {
      for (const s of [() => sessionStorage, () => localStorage]) {
        try { const v = JSON.parse(s().getItem(KEY) || "null"); if (v?.repo && v?.token) return v; } catch {}
      }
      return null;
    },
    save(v, remember) { try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(v)); } catch {} },
    clear() {
      try { sessionStorage.removeItem(KEY); } catch {}
      try { localStorage.removeItem(KEY); } catch {}
    },
  };

  // ───────── GitHub API ─────────
  async function gh(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${state.auth.token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) {
      const e = new Error(body?.message || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return body;
  }
  const explain = (e) => {
    if (e.status === 401) return "토큰이 올바르지 않거나 만료됐어요. 새 토큰으로 다시 로그인해 주세요.";
    if (e.status === 403) return "이 토큰으로는 저장소를 고칠 수 없어요. 토큰의 Contents 권한을 Read and write 로 만들어 주세요.";
    if (e.status === 404) return "저장소나 파일을 찾을 수 없어요. 저장소 이름과 토큰의 저장소 권한을 확인해 주세요.";
    if (e.status === 409 || e.status === 422) return "다른 변경과 겹쳤어요. 잠시 후 다시 시도해 주세요.";
    if (e.name === "TypeError") return "GitHub 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
    return "오류: " + clean(e.message, 150);
  };

  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const bytesToB64 = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64encode = (str) => bytesToB64(new TextEncoder().encode(str));
  const repoPath = () => `/repos/${state.auth.repo}`;
  const contentsUrl = (path) => `${repoPath()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

  async function readJson(path, fallback) {
    try {
      const f = await gh(`${contentsUrl(path)}?ref=${BRANCH}`);
      return { data: JSON.parse(b64decode(f.content)), sha: f.sha };
    } catch (e) {
      if (e.status === 404 && fallback !== undefined) return { data: fallback(), sha: undefined };
      throw e;
    }
  }
  const putFile = (path, b64, message, sha) => gh(contentsUrl(path), {
    method: "PUT",
    body: JSON.stringify({ message: `관리자: ${message}`, branch: BRANCH, content: b64, ...(sha ? { sha } : {}) }),
  });
  async function deleteFile(path, message) {
    try {
      const f = await gh(`${contentsUrl(path)}?ref=${BRANCH}`);
      await gh(contentsUrl(path), { method: "DELETE", body: JSON.stringify({ message: `관리자: ${message}`, branch: BRANCH, sha: f.sha }) });
    } catch { /* 이미 없으면 무시 */ }
  }
  // 변경 함수(mutate)를 최신 파일에 적용해 저장. 다른 변경과 겹치면 최신본을 다시 받아 최대 3번 재시도.
  async function saveJson(path, message, mutate, { normalize, fallback } = {}) {
    for (let attempt = 1; ; attempt++) {
      const { data, sha } = await readJson(path, fallback);
      const doc = normalize ? normalize(data) : data;
      const changed = mutate(doc);
      if (changed === false) return { doc, changed: false };
      try {
        await putFile(path, b64encode(JSON.stringify(doc, null, 2) + "\n"), message, sha);
        return { doc, changed: true };
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt < 3) continue;
        throw e;
      }
    }
  }

  const normConfig = (cfg) => {
    cfg = cfg && typeof cfg === "object" ? cfg : {};
    for (const k of ["channels", "videos", "exclude"]) if (!Array.isArray(cfg[k])) cfg[k] = [];
    return cfg;
  };
  const defaultSite = () => ({
    siteName: "All AI-Cinema", menu: [],
    adsense: { client: "", slots: {} },
    banners: [{ image: "", link: "", alt: "" }, { image: "", link: "", alt: "" }, { image: "", link: "", alt: "" }],
  });
  const normSite = (s) => {
    s = s && typeof s === "object" ? s : defaultSite();
    if (!Array.isArray(s.menu)) s.menu = [];
    if (!s.adsense || typeof s.adsense !== "object") s.adsense = { client: "", slots: {} };
    if (!s.adsense.slots || typeof s.adsense.slots !== "object") s.adsense.slots = {};
    if (!Array.isArray(s.banners)) s.banners = [];
    while (s.banners.length < 3) s.banners.push({ image: "", link: "", alt: "" });
    s.banners = s.banners.slice(0, 3);
    if (s.openMode !== "page" && s.openMode !== "inline") s.openMode = "inline";
    if (s.works !== false) s.works = true;
    if (!Array.isArray(s.strips)) s.strips = [];
    return s;
  };
  const saveConfig = (msg, mutate) => saveJson(CONFIG, msg, mutate, { normalize: normConfig }).then((r) => { state.config = r.doc; return r.changed; });
  const saveSite = (msg, mutate) => saveJson(SITE, msg, mutate, { normalize: normSite, fallback: defaultSite }).then((r) => { state.site = r.doc; return r.changed; });

  // ───────── 유튜브 링크 해석 ─────────
  function parseLink(s) {
    s = String(s || "").trim();
    if (!s || s.length > 300) return null;
    if (/^@[\p{L}\p{N}._-]{3,100}$/u.test(s)) return { type: "channel", url: "https://www.youtube.com/" + s, label: s };
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    let p;
    try { p = u.pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return null; }
    if (host === "youtu.be" && VALID_ID.test(p[0] || "")) return { type: "video", id: p[0] };
    if (host !== "youtube.com") return null;
    const v = u.searchParams.get("v");
    if (p[0] === "watch" && VALID_ID.test(v || "")) return { type: "video", id: v };
    if (["shorts", "live", "embed"].includes(p[0]) && VALID_ID.test(p[1] || "")) return { type: "video", id: p[1], short: p[0] === "shorts" };
    if (p[0] === "channel" && /^UC[\w-]{22}$/.test(p[1] || "")) return { type: "channel", url: `https://www.youtube.com/channel/${p[1]}`, id: p[1], label: p[1] };
    if (p[0]?.startsWith("@") && /^@[\p{L}\p{N}._-]{3,100}$/u.test(p[0])) return { type: "channel", url: `https://www.youtube.com/${p[0]}`, label: p[0] };
    if (["c", "user"].includes(p[0]) && /^[\p{L}\p{N}._-]{1,100}$/u.test(p[1] || "")) return { type: "channel", url: `https://www.youtube.com/${p[0]}/${p[1]}`, label: p[1] };
    return null;
  }
  const idOf = (x) => {
    if (typeof x === "string") return VALID_ID.test(x) ? x : parseLink(x)?.id || null;
    return x?.id && VALID_ID.test(x.id) ? x.id : parseLink(x?.url)?.id || null;
  };
  const catsOf = (c) => {
    const raw = Array.isArray(c?.categories) ? c.categories : [c?.category];
    return [...new Set(raw.map((x) => clean(x, 30)).filter(Boolean))];
  };
  const menuItems = () => {
    const m = (state.site?.menu || []).map((x) => clean(x, 30)).filter(Boolean);
    return m.length ? m : ["AI 드라마", "AI 영화", "AI 단편"];
  };
  const sameChannel = (a, r) =>
    (a.url && r.url && a.url.toLowerCase().replace(/\/+$/, "") === r.url.toLowerCase()) || (r.id && a.id === r.id);

  // ───────── 사이트의 영상 목록 읽기 ─────────
  async function loadData() {
    const r = await fetch("../data/videos.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("영상 목록을 불러오지 못했어요");
    const d = await r.json();
    const items = Array.isArray(d.items) ? d.items : [];
    state.data = d;
    state.videos = items.filter((x) => Array.isArray(x) && VALID_ID.test(x[0])).map((x) => ({
      id: x[0],
      title: clean(x[1], 200),
      channel: clean(d.channels?.[x[2]], 80) || "(채널 이름 없음)",
      categories: (Array.isArray(x[3]) ? x[3] : [x[3]]).map((i) => clean(d.cats?.[i], 30)).filter(Boolean),
      published: Number(x[4]) * 1000,
      views: Number(x[5]) || 0,
      manual: x[8] === 1,
      cid: /^UC[\w-]{22}$/.test(d.cids?.[x[7]] || "") ? d.cids[x[7]] : "",
      series: Number.isInteger(x[9]) && x[9] >= 0 ? clean(d.series?.[x[9]], 40) : "",
    }));
    // 채널 이름 → 유튜브 프로필 사진 (yt3 주소만)
    state.avatarByName = new Map();
    const av = d.avatars && typeof d.avatars === "object" ? d.avatars : {};
    for (const x of items) {
      const name = clean(d.channels?.[x?.[2]], 80), u = av[d.cids?.[x?.[7]]];
      if (name && !state.avatarByName.has(name) && typeof u === "string" && /^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[\w\-./=~%]{10,500}$/.test(u)) state.avatarByName.set(name, u);
    }
    const live = new Set(state.videos.map((v) => v.id));
    for (const id of state.pending) if (!live.has(id)) state.pending.delete(id);
  }

  // ───────── 저장 후 사이트 반영 진행 상황 ─────────
  let pubTimer;
  function trackPublish(title, check, { collect }) {
    clearInterval(pubTimer);
    const box = $("#pub");
    const t0 = Date.now();
    const steps = collect
      ? ["GitHub에 저장", "영상 수집 · 사이트 배포", "사이트 반영 완료"]
      : ["GitHub에 저장", "사이트 배포", "사이트 반영 완료"];
    const draw = (stage, note) => {
      box.hidden = false;
      box.textContent = "";
      box.className = "adm-pub" + (stage === 3 ? " done" : stage === -1 ? " warn" : "");
      box.append(
        el("b", { text: title }),
        el("ol", {}, steps.map((s, i) => el("li", {
          class: stage === -1 ? (i === 0 ? "ok" : "") : i + 1 < stage || stage === 3 ? "ok" : i + 1 === stage ? "now" : "",
          text: s,
        }))),
        note ? el("p", { text: note }) : null,
      );
    };
    draw(2, collect ? "보통 1~3분 걸려요. 이 창을 닫아도 반영은 계속돼요." : "보통 1분 안에 끝나요.");
    pubTimer = setInterval(async () => {
      let ok = false;
      try { ok = await check(); } catch {}
      if (ok) {
        clearInterval(pubTimer);
        draw(3, "사이트에서 새로고침하면 바로 보여요.");
        try { await loadData(); renderAll(); } catch {}
        setTimeout(() => { if (box.classList.contains("done")) box.hidden = true; }, 15000);
      } else if (Date.now() - t0 > 6 * 60e3) {
        clearInterval(pubTimer);
        draw(-1, "6분이 지나도 반영되지 않았어요. GitHub 저장소의 Actions 탭에서 빨간 X가 있는지 확인하거나, Cloudways에서 Pull을 눌러 주세요.");
      }
    }, 10000);
  }
  async function siteMeta() {
    const r = await fetch("../data/meta.json", { cache: "no-store" });
    return r.ok ? (await r.json()).generatedAt || "" : "";
  }
  async function afterConfigSave(title) {
    const before = await siteMeta().catch(() => "");
    trackPublish(title, async () => (await siteMeta()) !== before, { collect: true });
  }
  function afterSiteSave(title) {
    const want = JSON.stringify(state.site);
    trackPublish(title, async () => {
      const r = await fetch("../data/site.json", { cache: "no-store" });
      return r.ok && JSON.stringify(normSite(await r.json())) === want;
    }, { collect: false });
  }

  // ───────── 화면 그리기 ─────────
  function renderStatus() {
    const s = $("#status");
    s.textContent = "";
    const gen = state.data?.generatedAt ? Date.parse(state.data.generatedAt) : NaN;
    s.append(...[
      el("span", {}, "저장소 ", el("b", { text: state.auth.repo })),
      el("span", {}, "채널 ", el("b", { text: `${state.config?.channels.length || 0}개` })),
      el("span", {}, "사이트 영상 ", el("b", { text: `${state.videos.length}개` })),
      el("span", {}, "마지막 수집 ", el("b", { text: Number.isFinite(gen) ? ago(gen) : "아직 없음" })),
      state.pending.size ? el("span", {}, "숨김 반영 대기 ", el("b", { text: `${state.pending.size}개` })) : null,
      el("button", { class: "btn", type: "button", onclick: refresh, text: "새로고침" }),
    ].filter(Boolean));
    $("#hiddenCount").textContent = state.config?.exclude.length ? `(${state.config.exclude.length})` : "";
  }

  // 채널 추가 폼
  function renderAddCats() {
    const box = $("#addCats");
    box.textContent = "";
    for (const m of menuItems()) {
      box.append(el("button", {
        type: "button", class: "adm-chip", "aria-pressed": String(state.addCats.has(m)), text: m,
        onclick: () => { state.addCats.has(m) ? state.addCats.delete(m) : state.addCats.add(m); renderAddCats(); updateAddForm(); },
      }));
    }
    box.append(el("button", {
      type: "button", class: "adm-chip adm-chip--add", text: "+ 새 카테고리",
      "aria-expanded": String(!$("#newCatBox").hidden), "aria-controls": "newCatBox",
      onclick: () => openNewCat(true),
    }));
  }
  function openNewCat(open) {
    $("#newCatBox").hidden = !open;
    $("#newCatName").value = "";
    renderAddCats();
    if (open) $("#newCatName").focus();
  }
  // 새 카테고리 만들기 → site.json 메뉴에 추가(사이트 1줄 메뉴에 바로 반영) + 지금 등록 중인 채널에 자동 선택
  function createCategory() {
    const v = clean($("#newCatName").value, 30);
    if (!v) return $("#newCatName").focus();
    if (v === "전체") return toast("'전체'는 이미 있는 기본 메뉴라 쓸 수 없어요.", true);
    const current = menuItems();
    if (current.includes(v)) { state.addCats.add(v); openNewCat(false); updateAddForm(); return toast(`'${v}'은(는) 이미 있는 카테고리예요. 선택해 두었어요.`); }
    if (current.length >= 30) return toast("카테고리는 30개까지 만들 수 있어요.", true);
    run(async () => {
      await saveSite(`카테고리 추가: ${v}`, (s) => {
        if (!s.menu.length) s.menu = [...current];   // 메뉴가 비어 있으면 지금 보이는 기본 카테고리부터 저장
        if (s.menu.includes(v)) return false;
        s.menu.push(v);
        return true;
      });
      state.menuDraft = null;
      state.addCats.add(v);
      openNewCat(false);
      updateAddForm(); renderChannels(); renderMenu();
      toast(`'${v}' 카테고리를 만들었어요. 사이트 위쪽 메뉴에도 추가돼요.`);
      afterSiteSave(`'${v}' 카테고리 추가 반영 중`);
    });
  }
  function updateAddForm() {
    const r = parseLink($("#addUrl").value);
    const hint = $("#addHint");
    const val = $("#addUrl").value.trim();
    hint.className = "adm-hint";
    if (!val) hint.textContent = "";
    else if (!r) { hint.textContent = "유튜브 채널 주소가 아니에요. 예: https://www.youtube.com/@채널이름"; hint.classList.add("bad"); }
    else if (r.type === "channel") {
      const dup = state.config?.channels.some((c) => sameChannel(c, r));
      hint.textContent = dup ? `이미 등록된 채널이에요 (${r.label}). 아래 목록에서 메뉴를 바꿀 수 있어요.` : `✓ 채널 확인: ${r.label} — 앞으로 올라오는 새 영상도 자동으로 추가돼요.`;
      hint.classList.add(dup ? "bad" : "ok");
    } else { hint.textContent = "✓ 영상 주소예요 — 이 영상 하나만 추가돼요."; hint.classList.add("ok"); }
    const dup = r?.type === "channel" && state.config?.channels.some((c) => sameChannel(c, r));
    $("#addBtn").disabled = !r || dup || !state.addCats.size || state.busy;
    $("#addBtn").textContent = !state.addCats.size && r ? "카테고리를 하나 이상 골라 주세요" : "추가하고 바로 반영";
  }

  function renderChannels() {
    const list = $("#channelList");
    list.textContent = "";
    const chs = state.config?.channels || [];
    $("#chCount").textContent = chs.length ? `(${chs.length})` : "";
    const counts = new Map(), cidCount = new Map(), cidName = new Map();
    for (const v of state.videos) {
      counts.set(v.channel, (counts.get(v.channel) || 0) + 1);
      if (v.cid) { cidCount.set(v.cid, (cidCount.get(v.cid) || 0) + 1); if (!cidName.has(v.cid)) cidName.set(v.cid, v.channel); }
    }
    const srcs = state.data?.srcs && typeof state.data.srcs === "object" ? state.data.srcs : {};
    const cidOfCfg = (c) => (c.id && /^UC[\w-]{22}$/.test(c.id) ? c.id : srcs[clean(c.id || c.url || c.handle, 200)] || "");
    if (!chs.length) { list.append(el("li", { class: "adm-empty", text: "등록된 채널이 없어요. 위에서 추가해 주세요." })); return; }
    const menu = menuItems();
    chs.forEach((c) => {
      const key = JSON.stringify(c);
      const name0 = clean(c.name, 80);
      const label = name0 || clean(c.url || c.handle || c.id, 100);
      const draft = new Set(catsOf(c));
      const orig = [...draft].sort().join("|");
      const nameIn = el("input", { type: "text", class: "adm-name", value: name0, placeholder: "표시 이름 (비우면 유튜브 이름)", maxlength: "80", "aria-label": `${label} 표시 이름` });
      const save = el("button", { class: "btn btn--primary", type: "button", text: "저장", disabled: true });
      const dirty = () => { save.disabled = state.busy || ([...draft].sort().join("|") === orig && nameIn.value.trim() === name0) || !draft.size; };
      nameIn.addEventListener("input", dirty);
      const chips = el("div", { class: "adm-chips small-chips", role: "group", "aria-label": "메뉴" },
        [...new Set([...menu, ...draft])].map((m) => {
          const b = el("button", { type: "button", class: "adm-chip" + (menu.includes(m) ? "" : " stale"), "aria-pressed": String(draft.has(m)), text: m });
          b.addEventListener("click", () => { draft.has(m) ? draft.delete(m) : draft.add(m); b.setAttribute("aria-pressed", String(draft.has(m))); dirty(); });
          return b;
        }));
      save.addEventListener("click", () => run(async () => {
        const name = clean(nameIn.value, 80);
        await saveConfig(`채널 수정: ${label}`, (cfg) => {
          const i = cfg.channels.findIndex((y) => JSON.stringify(y) === key);
          if (i < 0) return false;
          const { category: _old, ...rest } = cfg.channels[i];
          cfg.channels[i] = { ...rest, categories: [...draft], ...(name ? { name } : {}) };
          if (!name) delete cfg.channels[i].name;
          return true;
        });
        renderChannels(); renderStatus();
        toast("채널 정보를 저장했어요.");
        afterConfigSave(`'${name || label}' 채널 수정 반영 중`);
      }));
      const del = el("button", { class: "btn", type: "button", text: "삭제" });
      del.addEventListener("click", () => {
        if (del.dataset.armed) return removeChannel(key, label);
        del.dataset.armed = "1";
        del.textContent = "정말 삭제할까요?";
        del.classList.add("btn--danger");
        setTimeout(() => { delete del.dataset.armed; del.textContent = "삭제"; del.classList.remove("btn--danger"); }, 4000);
      });
      const url = clean(c.url || (c.id ? `https://www.youtube.com/channel/${c.id}` : ""), 200);
      list.append(el("li", { class: "adm-chcard" },
        el("div", { class: "adm-chhead" },
          (() => {
            const avEl = el("span", { class: "chtab__av", "aria-hidden": "true", text: label.replace(/^@/, "")[0] || "?" });
            const u = state.avatarByName?.get(name0) || state.avatarByName?.get(label);
            if (u) { const im = el("img", { src: u, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }); im.addEventListener("error", () => im.remove()); avEl.append(im); }
            return avEl;
          })(),
          el("div", { class: "adm-chinfo" },
            el("b", { text: label }),
            el("div", { class: "meta" },
              `${!name0 && cidName.get(cidOfCfg(c)) ? cidName.get(cidOfCfg(c)) + " · " : ""}영상 ${cidCount.get(cidOfCfg(c)) || counts.get(name0) || counts.get(label) || 0}개 · `,
              url ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: "유튜브에서 보기 ↗" }) : "",
            ),
          ),
        ),
        nameIn, chips,
        el("div", { class: "adm-actions" }, save, del),
      ));
    });
  }

  function renderChannelFilter() {
    const sel = $("#chFilter");
    const counts = new Map();
    for (const v of state.videos) counts.set(v.channel, (counts.get(v.channel) || 0) + 1);
    sel.textContent = "";
    sel.append(el("option", { value: "", text: `전체 채널 (${state.videos.length})` }));
    for (const [name, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0], "ko"))) {
      sel.append(el("option", { value: name, text: `${name} (${n})`, selected: name === state.ch }));
    }
    if (state.ch && !counts.has(state.ch)) state.ch = "";
  }
  const filtered = () => {
    const q = state.q.trim().toLowerCase();
    return state.videos.filter((v) => (!state.ch || v.channel === state.ch) && (!q || v.title.toLowerCase().includes(q)));
  };
  function videoRow(v) {
    const pending = state.pending.has(v.id);
    const cb = el("input", {
      type: "checkbox", "aria-label": `${v.title} 선택`, disabled: pending, checked: state.selected.has(v.id),
      onchange: (e) => { e.target.checked ? state.selected.add(v.id) : state.selected.delete(v.id); updateBulk(); },
    });
    return el("li", { class: "adm-item" + (pending ? " pending" : ""), dataset: { id: v.id } },
      cb,
      el("img", { src: thumb(v.id), alt: "", loading: "lazy", width: 120, height: 68 }),
      el("div", {},
        el("b", {}, v.title, el("span", { class: "pill", text: "숨김 대기" })),
        el("div", { class: "meta", text: [v.channel, v.categories.join("·"), ago(v.published), fmtViews(v.views), v.manual ? "직접 추가" : ""].filter(Boolean).join(" · ") }),
      ),
      el("button", { class: "btn", type: "button", disabled: pending, onclick: () => hide([v.id]), text: "숨기기" }),
    );
  }
  function renderVideos(reset = true) {
    const list = $("#videoList");
    const items = filtered();
    if (reset) { list.textContent = ""; state.shown = 0; }
    const end = Math.min(state.shown + PAGE, items.length);
    for (let i = state.shown; i < end; i++) list.append(videoRow(items[i]));
    state.shown = end;
    $("#more").hidden = state.shown >= items.length;
    $("#listInfo").textContent = items.length ? `${items.length}개 중 ${state.shown}개 표시` : "";
    if (!items.length) list.append(el("li", { class: "adm-empty", text: state.videos.length ? "조건에 맞는 영상이 없어요." : "아직 수집된 영상이 없어요." }));
    updateBulk();
  }
  function updateBulk() {
    const visible = filtered().filter((v) => !state.pending.has(v.id));
    const n = [...state.selected].filter((id) => !state.pending.has(id)).length;
    const b = $("#hideSelected");
    b.disabled = !n || state.busy;
    b.textContent = n ? `선택한 영상 ${n}개 숨기기` : "선택한 영상 숨기기";
    $("#selectAll").checked = visible.length > 0 && visible.every((v) => state.selected.has(v.id));
  }

  function renderHidden() {
    const list = $("#hiddenList");
    list.textContent = "";
    const ex = state.config?.exclude || [];
    if (!ex.length) { list.append(el("li", { class: "adm-empty", text: "숨긴 영상이 없어요." })); return; }
    [...ex].reverse().forEach((x) => {
      const id = idOf(x);
      const title = clean(typeof x === "object" ? x.title : "", 200) || (id ? `영상 ${id}` : clean(x, 100));
      const meta = typeof x === "object" ? [clean(x.channel, 80), x.hiddenAt ? ago(Date.parse(x.hiddenAt)) + " 숨김" : ""].filter(Boolean).join(" · ") : "";
      list.append(el("li", { class: "adm-item no-check" + (id ? "" : " no-thumb") },
        id ? el("img", { src: thumb(id), alt: "", loading: "lazy", width: 120, height: 68 }) : null,
        el("div", {}, el("b", { text: title }), meta ? el("div", { class: "meta", text: meta }) : null),
        el("button", { class: "btn", type: "button", onclick: () => restore(x), text: "복원" }),
      ));
    });
  }

  // 메뉴 편집
  function renderMenu() {
    if (!state.menuDraft) state.menuDraft = [...(state.site?.menu || [])];
    const d = state.menuDraft;
    const list = $("#menuList");
    list.textContent = "";
    const used = new Map();
    for (const c of state.config?.channels || []) for (const m of catsOf(c)) used.set(m, (used.get(m) || 0) + 1);
    if (!d.length) list.append(el("li", { class: "adm-empty", text: "메뉴가 없어요. 아래에서 추가해 주세요." }));
    d.forEach((m, i) => {
      const mv = (to) => { [d[i], d[to]] = [d[to], d[i]]; renderMenu(); };
      list.append(el("li", { class: "adm-menuitem" },
        el("span", { class: "adm-menuname", text: m }),
        el("span", { class: "muted small", text: used.get(m) ? `채널 ${used.get(m)}개` : "채널 없음" }),
        el("span", { class: "adm-menubtns" },
          el("button", { class: "btn", type: "button", "aria-label": `${m} 위로`, disabled: i === 0, onclick: () => mv(i - 1), text: "▲" }),
          el("button", { class: "btn", type: "button", "aria-label": `${m} 아래로`, disabled: i === d.length - 1, onclick: () => mv(i + 1), text: "▼" }),
          el("button", { class: "btn", type: "button", "aria-label": `${m} 삭제`, onclick: () => { d.splice(i, 1); renderMenu(); }, text: "✕" }),
        ),
      ));
    });
    $("#menuSave").disabled = state.busy || JSON.stringify(d) === JSON.stringify(state.site?.menu || []);
  }

  // 배너 3칸 편집
  function renderBanners() {
    const box = $("#bannerList");
    box.textContent = "";
    (state.site?.banners || []).slice(0, 3).forEach((b, i) => {
      const file = state.bannerFiles[i];
      const cur = SAFE_IMG.test(b.image || "") ? "../" + b.image : "";
      const previewSrc = file ? file.url : cur;
      const fileIn = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", id: `bf${i}`, class: "adm-file" });
      const linkIn = el("input", { type: "url", inputmode: "url", value: b.link || "", placeholder: "https://클릭하면-이동할-주소", "aria-label": `배너 ${i + 1} 링크` });
      const altIn = el("input", { type: "text", value: b.alt || "", maxlength: "80", placeholder: "배너 설명 (예: ○○ 브랜드 할인)", "aria-label": `배너 ${i + 1} 설명` });
      fileIn.addEventListener("change", () => {
        const f = fileIn.files?.[0];
        if (state.bannerFiles[i]) URL.revokeObjectURL(state.bannerFiles[i].url);
        state.bannerFiles[i] = f ? { file: f, url: URL.createObjectURL(f) } : null;
        renderBanners();
      });
      box.append(el("div", { class: "adm-banner" },
        el("div", { class: "adm-banner__head" }, el("b", { text: `배너 ${i + 1}` }), file ? el("span", { class: "pill on", text: "새 이미지 선택됨" }) : null),
        el("div", { class: "adm-banner__preview" }, previewSrc ? el("img", { src: previewSrc, alt: "" }) : el("span", { class: "muted small", text: "비어 있음" })),
        el("label", { class: "btn adm-filebtn", for: `bf${i}` }, "이미지 고르기"), fileIn,
        linkIn, altIn,
        el("div", { class: "adm-actions" },
          el("button", { class: "btn btn--primary", type: "button", text: "저장", onclick: () => saveBanner(i, linkIn.value, altIn.value) }),
          el("button", { class: "btn", type: "button", text: "비우기", disabled: !b.image && !file, onclick: () => clearBanner(i) }),
        ),
      ));
    });
  }

  // ───────── 목록 사이 띠 배너 ─────────
  state.stripFiles = {};
  function renderStrips() {
    const box = $("#stripList");
    if (!box) return;
    box.textContent = "";
    const list = Array.isArray(state.site?.strips) ? state.site.strips : [];
    $("#stripAdd").disabled = list.length >= 5;
    if (!list.length) box.append(el("p", { class: "muted small", text: "아직 띠 배너가 없어요. '+ 띠 배너 추가'를 눌러 만들어 보세요." }));
    list.forEach((b, i) => {
      const pick = state.stripFiles[i];
      const iconSrc = pick ? pick.url : SAFE_IMG.test(b.icon || "") ? "../" + b.icon : "../assets/logo.svg?v=2";
      const on = el("input", { type: "checkbox", id: `st-on-${i}` }); on.checked = b.on !== false;
      const title = el("input", { type: "text", maxlength: "40", value: b.title || "", placeholder: "제목 (예: 홈 화면에 All AI-Cinema 추가)", "aria-label": `띠 배너 ${i + 1} 제목` });
      const desc = el("input", { type: "text", maxlength: "80", value: b.desc || "", placeholder: "설명 한 줄 (선택)", "aria-label": `띠 배너 ${i + 1} 설명` });
      const cta = el("input", { type: "text", maxlength: "12", value: b.cta || "", placeholder: "버튼 글자 (예: 보러 가기)", "aria-label": `띠 배너 ${i + 1} 버튼` });
      const link = el("input", { type: "url", inputmode: "url", value: b.link || "", placeholder: "https://클릭하면-이동할-주소", "aria-label": `띠 배너 ${i + 1} 링크` });
      const fileIn = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", id: `st-f-${i}`, class: "adm-file" });
      // 미리보기 (사이트와 같은 모양)
      const pv = { img: el("img", { src: iconSrc, alt: "" }), t: el("b", { text: b.title || "제목" }), d: el("span", { text: b.desc || "" }), go: el("span", { class: "strip__go", text: b.cta || "" }) };
      const sync = () => { pv.t.textContent = title.value || "제목"; pv.d.textContent = desc.value; pv.go.textContent = cta.value; pv.go.hidden = !cta.value; };
      for (const x of [title, desc, cta]) x.addEventListener("input", sync);
      fileIn.addEventListener("change", () => {
        const f = fileIn.files?.[0];
        if (state.stripFiles[i]) URL.revokeObjectURL(state.stripFiles[i].url);
        state.stripFiles[i] = f ? { file: f, url: URL.createObjectURL(f) } : null;
        pv.img.src = f ? state.stripFiles[i].url : iconSrc;
      });
      sync();
      box.append(el("div", { class: "adm-strip" },
        el("div", { class: "adm-strip__head" }, el("b", { text: `띠 배너 ${i + 1}` }),
          el("label", { class: "adm-check", for: `st-on-${i}` }, on, " 사이트에 보이기")),
        el("div", { class: "adm-strip__pv strip" }, el("div", { class: "strip__in" }, el("span", { class: "strip__ad", text: "광고" }), pv.img, el("span", { class: "strip__txt" }, pv.t, pv.d), pv.go)),
        el("div", { class: "adm-strip__grid" },
          el("label", { class: "btn adm-filebtn", for: `st-f-${i}` }, "아이콘 고르기"), fileIn, title, desc, cta, link),
        el("div", { class: "adm-actions" },
          el("button", { class: "btn btn--primary", type: "button", text: "저장", onclick: () => saveStrip(i, { on: on.checked, title: title.value, desc: desc.value, cta: cta.value, link: link.value }) }),
          el("button", { class: "btn", type: "button", text: "삭제", onclick: () => deleteStrip(i) })),
      ));
    });
  }
  function addStrip() {
    const list = Array.isArray(state.site?.strips) ? state.site.strips : [];
    if (list.length >= 5) return toast("띠 배너는 5개까지 만들 수 있어요.", true);
    state.site.strips = [...list, { on: true, icon: "", title: "", desc: "", cta: "", link: "" }];   // 저장 전 빈 칸 (저장해야 사이트에 반영)
    renderStrips();
    $("#stripList").lastElementChild?.querySelector('input[type="text"]')?.focus();
  }
  function saveStrip(i, raw) {
    const title = clean(raw.title, 40), desc = clean(raw.desc, 80), cta = clean(raw.cta, 12);
    const link = safeLink(String(raw.link || "").trim());
    if (!title) return toast("제목을 넣어 주세요.", true);
    if (!link) return toast("링크는 https:// 로 시작하는 주소로 넣어 주세요.", true);
    const pick = state.stripFiles[i];
    run(async () => {
      const old = state.site?.strips?.[i]?.icon || "";
      let icon = old;
      if (pick) {
        const { b64, ext } = await toWebp(pick.file, { max: 192, square: true });
        const name = `strip-${i + 1}-${Date.now()}.${ext}`;
        await putFile(`${UPLOADS}/${name}`, b64, `띠 배너 ${i + 1} 아이콘 업로드`);
        icon = `uploads/${name}`;
      }
      await saveSite(`띠 배너 ${i + 1} 저장`, (s) => {
        s.strips = Array.isArray(s.strips) ? s.strips : [];
        s.strips[i] = { on: !!raw.on, icon, title, desc, cta, link };
        s.strips = s.strips.filter(Boolean).slice(0, 5);
        return true;
      });
      if (pick) {
        URL.revokeObjectURL(pick.url); state.stripFiles[i] = null;
        if (old && old !== icon && SAFE_IMG.test(old)) await deleteFile(`public/${old}`, `이전 띠 배너 ${i + 1} 아이콘 삭제`);
      }
      renderStrips();
      toast(`띠 배너 ${i + 1}을 저장했어요.`);
      afterSiteSave(`띠 배너 ${i + 1} 반영 중`);
    });
  }
  function deleteStrip(i) {
    const saved = (state.site?.strips || [])[i];
    if (state.stripFiles[i]) { URL.revokeObjectURL(state.stripFiles[i].url); }
    state.stripFiles = {};
    if (!saved?.title) { state.site.strips.splice(i, 1); return renderStrips(); }   // 저장 안 한 빈 칸
    run(async () => {
      await saveSite(`띠 배너 ${i + 1} 삭제`, (s) => { if (!Array.isArray(s.strips) || !s.strips[i]) return false; s.strips.splice(i, 1); return true; });
      if (SAFE_IMG.test(saved.icon || "")) await deleteFile(`public/${saved.icon}`, `띠 배너 ${i + 1} 아이콘 삭제`);
      renderStrips();
      toast(`띠 배너 ${i + 1}을 지웠어요.`);
      afterSiteSave(`띠 배너 삭제 반영 중`);
    });
  }

  function renderAds() {
    const a = state.site?.adsense || { client: "", slots: {} };
    $("#adClient").value = a.client || "";
    const box = $("#adSlots");
    box.textContent = "";
    for (const [k, name, desc] of SLOT_KEYS) {
      box.append(el("div", { class: "adm-slot" },
        el("label", { for: `slot-${k}`, text: name }),
        el("input", { id: `slot-${k}`, type: "text", inputmode: "numeric", value: a.slots?.[k] || "", placeholder: "광고 단위 번호", autocomplete: "off" }),
        el("span", { class: "muted small", text: desc }),
      ));
    }
    // 목록 사이 광고 간격 (영상 N개마다 1개)
    const every = [12, 24, 36, 48, 60].includes(+a.feedEvery) ? +a.feedEvery : 36;
    const sel = el("select", { id: "feedEvery" }, ...[12, 24, 36, 48, 60].map((n) => el("option", { value: String(n), text: `영상 ${n}개마다` })));
    sel.value = String(every);
    box.append(el("div", { class: "adm-slot" },
      el("label", { for: "feedEvery", text: "목록 사이 광고 간격" }), sel,
      el("span", { class: "muted small", text: "간격이 넓을수록 광고 수가 줄어 화면이 깔끔해져요" })));
  }

  // 영상 여는 방식 (page: 실제 페이지 이동 → 전면 광고 기회 / inline: 이동 없이 바로 재생)
  function renderOpenMode() {
    const mode = state.site?.openMode === "page" ? "page" : "inline";
    for (const r of document.querySelectorAll('input[name="openMode"]')) r.checked = r.value === mode;
    $("#openModeNow").textContent = mode === "page" ? "지금: 페이지 이동 방식" : "지금: 바로 재생 방식 (원래 방식)";
  }
  function saveOpenMode(e) {
    e.preventDefault();
    const mode = document.querySelector('input[name="openMode"]:checked')?.value === "page" ? "page" : "inline";
    run(async () => {
      const changed = await saveSite(`영상 여는 방식: ${mode === "page" ? "페이지 이동" : "바로 재생"}`, (s) => {
        if (s.openMode === mode) return false; s.openMode = mode; return true; });
      renderOpenMode();
      if (!changed) return toast("이미 이 방식이에요.");
      toast(mode === "page" ? "페이지 이동 방식으로 바꿨어요." : "원래 방식(바로 재생)으로 되돌렸어요.");
      afterSiteSave("영상 여는 방식 반영 중");
    });
  }

  function renderAll() {
    renderStatus();
    renderAddCats();
    updateAddForm();
    renderChannels();
    renderChannelFilter();
    renderVideos();
    renderHidden();
    renderMenu();
    renderBanners();
    renderStrips();
    renderAds(); renderOpenMode();
    renderWorks();
  }

  // ───────── 작품(시리즈) 관리 ─────────
  // 자동 분류(재생목록·제목) 결과를 채널별로 보여주고, 이름 바꾸기·합치기·묶지 않기·키워드 규칙을 channels.json 의 채널 항목 series 에 저장
  const cfgIndexOf = (cfg, name, cid) => {
    const srcs = state.data?.srcs || {};
    return cfg.channels.findIndex((c) => (cid && (c.id === cid || srcs[clean(c.id || c.url || c.handle, 200)] === cid)) || clean(c.name, 80) === name);
  };
  function seriesConfOf(name, cid) {
    const c = state.config?.channels[cfgIndexOf(state.config, name, cid)];
    const s = c?.series && typeof c.series === "object" ? c.series : {};
    return { rules: Array.isArray(s.rules) ? s.rules.filter((x) => x && typeof x.match === "string") : [], rename: s.rename && typeof s.rename === "object" ? { ...s.rename } : {} };
  }
  function saveSeriesConf(name, cid, label, mutate) {
    return run(async () => {
      const changed = await saveConfig(`작품 설정: ${name} – ${label}`, (cfg) => {
        const i = cfgIndexOf(cfg, name, cid);
        if (i < 0) throw new Error("이 채널을 설정 파일에서 찾지 못했어요. 채널 관리에서 이름을 확인해 주세요.");
        const cur = cfg.channels[i].series && typeof cfg.channels[i].series === "object" ? cfg.channels[i].series : {};
        const next = { rules: Array.isArray(cur.rules) ? [...cur.rules] : [], rename: { ...(cur.rename || {}) } };
        if (mutate(next) === false) return false;
        next.rules = next.rules.filter((x) => x.match).slice(0, 50);
        cfg.channels[i].series = next;
        if (!next.rules.length && !Object.keys(next.rename).length) delete cfg.channels[i].series;
        return true;
      });
      renderWorks();
      if (changed) { toast("저장했어요. 1~3분 뒤 사이트에 반영돼요."); afterConfigSave(`'${name}' 작품 정리 반영 중`); }
    });
  }
  function renderWorksSwitch() {
    const on = state.site?.works !== false;
    for (const r of document.querySelectorAll('input[name="worksOn"]')) r.checked = r.value === (on ? "on" : "off");
    $("#worksNow").textContent = on ? "지금: 켜짐" : "지금: 꺼짐 (원래 화면)";
  }
  function saveWorksSwitch(e) {
    e.preventDefault();
    const on = document.querySelector('input[name="worksOn"]:checked')?.value !== "off";
    run(async () => {
      const changed = await saveSite(`작품별 보기 ${on ? "켜기" : "끄기"}`, (s) => { if ((s.works !== false) === on) return false; s.works = on; return true; });
      renderWorksSwitch();
      if (!changed) return toast("이미 그 상태예요.");
      toast(on ? "작품별 보기를 켰어요." : "작품별 보기를 껐어요. 원래 화면으로 돌아가요.");
      afterSiteSave("작품별 보기 설정 반영 중");
    });
  }
  function renderWorks() {
    renderWorksSwitch();
    const box = $("#worksList");
    if (!box || !state.videos) return;
    const q = ($("#worksQ")?.value || "").trim().toLowerCase();
    const byCh = new Map();
    for (const v of state.videos) {
      if (!byCh.has(v.channel)) byCh.set(v.channel, { name: v.channel, cid: v.cid, vids: [], works: new Map() });
      const g = byCh.get(v.channel); g.vids.push(v);
      if (v.series) g.works.set(v.series, (g.works.get(v.series) || 0) + 1);
    }
    const chans = [...byCh.values()].filter((g) => !q || g.name.toLowerCase().includes(q) || [...g.works.keys()].some((w) => w.toLowerCase().includes(q)))
      .sort((a, b) => b.works.size - a.works.size || a.name.localeCompare(b.name, "ko"));
    const opened = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.ch));   // 다시 그려도 열린 채널 유지
    box.textContent = "";
    for (const g of chans) {
      const conf = seriesConfOf(g.name, g.cid);
      const grouped = [...g.works.values()].reduce((a, b) => a + b, 0);
      const det = el("details", { class: "adm-work", "data-ch": g.name });
      if (opened.has(g.name)) det.open = true;
      det.append(el("summary", {},
        el("span", { class: "adm-work__name", text: g.name }),
        el("span", { class: "muted small", text: `작품 ${g.works.size}개 · 묶인 영상 ${grouped}/${g.vids.length}` })));
      // 작품 목록
      const list = el("ul", { class: "adm-work__list" });
      const names = [...g.works].sort((a, b) => b[1] - a[1]).map(([n]) => n);
      for (const [n, c] of [...g.works].sort((a, b) => b[1] - a[1])) {
        const nameIn = el("input", { type: "text", value: n, maxlength: "40", "aria-label": `${n} 새 이름` });
        const rename = el("button", { type: "button", class: "btn", text: "이름 바꾸기" });
        rename.addEventListener("click", () => {
          const to = clean(nameIn.value, 40);
          if (!to || to === n) return toast("바꿀 이름을 입력해 주세요.", true);
          saveSeriesConf(g.name, g.cid, `'${n}' → '${to}'`, (s) => { s.rename[n] = to; });
        });
        const merge = el("select", { "aria-label": `${n} 합치기` }, el("option", { value: "", text: "다른 작품과 합치기…" }),
          ...names.filter((x) => x !== n).map((x) => el("option", { value: x, text: `→ ${x}` })));
        merge.addEventListener("change", () => { const to = merge.value; if (to) saveSeriesConf(g.name, g.cid, `'${n}'을 '${to}'에 합치기`, (s) => { s.rename[n] = to; }); });
        const ungroup = el("button", { type: "button", class: "btn btn--danger", text: "묶지 않기" });
        ungroup.addEventListener("click", () => saveSeriesConf(g.name, g.cid, `'${n}' 묶지 않기`, (s) => { s.rename[n] = ""; }));
        list.append(el("li", {}, el("span", { class: "adm-work__count", text: `${c}편` }), nameIn, rename, merge, ungroup));
      }
      if (!names.length) list.append(el("li", { class: "muted small", text: "아직 묶인 작품이 없어요. 아래 '규칙 추가'로 직접 묶을 수 있어요." }));
      det.append(list);
      // 바꾼 내역 (되돌리기)
      const ren = Object.entries(conf.rename);
      if (ren.length) {
        const ul = el("ul", { class: "adm-work__rules" });
        for (const [from, to] of ren) {
          const undo = el("button", { type: "button", class: "btn", text: "되돌리기" });
          undo.addEventListener("click", () => saveSeriesConf(g.name, g.cid, `'${from}' 되돌리기`, (s) => { delete s.rename[from]; }));
          ul.append(el("li", {}, el("span", { text: to ? `자동 이름 '${from}' → '${to}'` : `'${from}' 묶지 않음` }), undo));
        }
        det.append(el("p", { class: "adm-label", text: "바꾼 내역" }), ul);
      }
      // 키워드 규칙
      const rules = el("ul", { class: "adm-work__rules" });
      conf.rules.forEach((ru, i) => {
        const del = el("button", { type: "button", class: "btn", text: "삭제" });
        del.addEventListener("click", () => saveSeriesConf(g.name, g.cid, "규칙 삭제", (s) => { s.rules.splice(i, 1); }));
        rules.append(el("li", {}, el("span", { text: ru.to ? `제목에 '${ru.match}' → '${ru.to}'` : `제목에 '${ru.match}' → 묶지 않음` }), del));
      });
      const kw = el("input", { type: "text", maxlength: "40", placeholder: "제목에 들어간 단어 (예: 배달원, 아웃사이더)", "aria-label": "제목 단어" });
      const to = el("input", { type: "text", maxlength: "40", placeholder: "작품 이름 (예: 배달원)", "aria-label": "작품 이름" });
      const add = el("button", { type: "button", class: "btn btn--primary", text: "규칙 추가" });
      add.addEventListener("click", () => {
        const m = clean(kw.value, 40), t = clean(to.value, 40);
        if (m.length < 2) return toast("제목 단어를 2글자 이상 넣어 주세요.", true);
        saveSeriesConf(g.name, g.cid, `규칙 '${m}' → '${t || "묶지 않음"}'`, (s) => { s.rules = s.rules.filter((x) => x.match !== m); s.rules.push({ match: m, to: t }); });
      });
      det.append(el("p", { class: "adm-label", text: "직접 묶기 규칙 (자동 분류보다 먼저 적용)" }), rules,
        el("div", { class: "adm-work__add" }, kw, to, add),
        el("p", { class: "muted small", text: "여러 단어는 쉼표로 (예: 배달원, 아웃사이더). 작품 이름을 비우면 그 단어가 든 영상은 묶지 않아요." }));
      box.append(det);
    }
  }

  // ───────── 작업 ─────────
  async function run(fn) {
    if (state.busy) return;
    state.busy = true;
    document.body.classList.add("adm-busy");
    updateBulk(); updateAddForm();
    try { await fn(); }
    catch (e) { toast(e.userMessage || explain(e), true); if (e.status === 401) logout(); }
    finally { state.busy = false; document.body.classList.remove("adm-busy"); updateBulk(); updateAddForm(); }
  }

  function addFromForm(e) {
    e.preventDefault();
    const r = parseLink($("#addUrl").value);
    const cats = [...state.addCats];
    const name = clean($("#addName").value, 80);
    if (!r || !cats.length) return updateAddForm();
    run(async () => {
      let added = false;
      await saveConfig(r.type === "channel" ? `채널 추가: ${r.label}` : `영상 추가: ${r.id}`, (cfg) => {
        if (r.type === "channel") {
          if (cfg.channels.some((c) => sameChannel(c, r))) return false;
          cfg.channels.push({ url: r.url, ...(name ? { name } : {}), categories: cats });
        } else {
          cfg.exclude = cfg.exclude.filter((y) => idOf(y) !== r.id);
          if (cfg.videos.some((y) => idOf(y) === r.id)) return false;
          cfg.videos.push({ url: `https://www.youtube.com/${r.short ? "shorts/" : "watch?v="}${r.id}`, categories: cats, ...(name ? { name } : {}) });
        }
        added = true;
        return true;
      });
      if (!added) return toast("이미 등록되어 있어요.");
      $("#addUrl").value = ""; $("#addName").value = "";
      renderChannels(); renderStatus(); renderMenu();
      toast(r.type === "channel" ? "채널을 추가했어요. 영상을 모으는 중이에요." : "영상을 추가했어요.");
      afterConfigSave(r.type === "channel" ? `'${name || r.label}' 채널 추가 반영 중` : "영상 추가 반영 중");
    });
  }

  function removeChannel(key, label) {
    run(async () => {
      await saveConfig(`채널 삭제: ${label}`, (cfg) => {
        const before = cfg.channels.length;
        cfg.channels = cfg.channels.filter((y) => JSON.stringify(y) !== key);
        return cfg.channels.length !== before;
      });
      renderChannels(); renderStatus(); renderMenu();
      toast(`'${label}' 채널을 삭제했어요.`);
      afterConfigSave(`'${label}' 채널 삭제 반영 중`);
    });
  }

  function hide(ids) {
    const targets = state.videos.filter((v) => ids.includes(v.id) && !state.pending.has(v.id));
    if (!targets.length) return;
    run(async () => {
      const now = new Date().toISOString();
      const ok = await saveConfig(`영상 ${targets.length}개 숨김`, (cfg) => {
        const have = new Set(cfg.exclude.map(idOf).filter(Boolean));
        let n = 0;
        for (const v of targets) {
          if (have.has(v.id)) continue;
          cfg.exclude.push({ url: `https://www.youtube.com/watch?v=${v.id}`, title: v.title, channel: v.channel, hiddenAt: now });
          n++;
        }
        const ids2 = new Set(targets.map((v) => v.id));
        const before = cfg.videos.length;
        cfg.videos = cfg.videos.filter((x) => !ids2.has(idOf(x)));  // 직접 추가했던 영상이면 목록에서도 뺌
        return n > 0 || cfg.videos.length !== before;
      });
      for (const v of targets) { state.pending.add(v.id); state.selected.delete(v.id); }
      renderStatus(); renderVideos(); renderHidden();
      toast(ok ? `${targets.length}개 영상을 숨겼어요.` : "이미 숨긴 영상이에요.");
      if (ok) afterConfigSave(`영상 ${targets.length}개 숨김 반영 중`);
    });
  }

  function restore(x) {
    const id = idOf(x);
    run(async () => {
      await saveConfig("영상 복원", (cfg) => {
        const before = cfg.exclude.length;
        cfg.exclude = cfg.exclude.filter((y) => (id ? idOf(y) !== id : JSON.stringify(y) !== JSON.stringify(x)));
        return cfg.exclude.length !== before;
      });
      if (id) state.pending.delete(id);
      renderStatus(); renderHidden();
      toast("복원했어요. 채널의 최근 영상 15개 안에 있거나 직접 추가한 영상이면 다시 보여요.");
      afterConfigSave("영상 복원 반영 중");
    });
  }

  function saveMenu() {
    const d = state.menuDraft.map((m) => clean(m, 30)).filter(Boolean);
    run(async () => {
      await saveSite("메뉴 변경", (s) => { s.menu = d; return true; });
      state.menuDraft = [...state.site.menu];
      renderMenu(); renderAddCats(); renderChannels();
      toast("카테고리를 저장했어요.");
      afterSiteSave("메뉴 변경 반영 중");
    });
  }

  // 이미지를 브라우저에서 다시 그려 WebP 로 변환 (최대 가로 1600px) → 숨은 데이터·스크립트 제거, 용량 감소
  async function toWebp(file, { max = 1600, square = false } = {}) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Object.assign(new Error("bad"), { userMessage: "PNG, JPG, WEBP, GIF 이미지만 올릴 수 있어요." });
    if (file.size > 8 * 1024 * 1024) throw Object.assign(new Error("big"), { userMessage: "이미지가 너무 커요. 8MB 이하로 올려 주세요." });
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      if (square) {   // 가운데를 정사각형으로 잘라서 max×max
        const side = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(max, side);
        c.width = c.height = Math.max(1, out);
        c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      } else {
        const scale = Math.min(1, max / img.naturalWidth);
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      }
      let blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.86));
      let ext = "webp";
      if (!blob || blob.type !== "image/webp") { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88)); ext = "jpg"; }
      if (!blob) throw Object.assign(new Error("enc"), { userMessage: "이미지를 변환하지 못했어요. 다른 이미지로 시도해 주세요." });
      return { b64: bytesToB64(new Uint8Array(await blob.arrayBuffer())), ext };
    } catch (e) {
      if (e.userMessage) throw e;
      throw Object.assign(new Error("decode"), { userMessage: "이미지를 읽지 못했어요. 다른 이미지로 시도해 주세요." });
    } finally { URL.revokeObjectURL(url); }
  }

  function saveBanner(i, linkRaw, altRaw) {
    const link = safeLink(linkRaw.trim());
    if (link === null) return toast("링크는 https:// 로 시작하는 주소로 넣어 주세요.", true);
    const alt = clean(altRaw, 80);
    const pick = state.bannerFiles[i];
    run(async () => {
      const old = state.site?.banners?.[i]?.image || "";
      let image = old;
      if (pick) {
        const { b64, ext } = await toWebp(pick.file);
        const name = `banner-${i + 1}-${Date.now()}.${ext}`;
        await putFile(`${UPLOADS}/${name}`, b64, `배너 ${i + 1} 이미지 업로드`);
        image = `uploads/${name}`;
      }
      if (!image) return toast("이미지를 먼저 골라 주세요.", true);
      await saveSite(`배너 ${i + 1} 저장`, (s) => { s.banners[i] = { image, link, alt }; return true; });
      if (pick) {
        URL.revokeObjectURL(pick.url);
        state.bannerFiles[i] = null;
        if (old && old !== image && SAFE_IMG.test(old)) await deleteFile(`public/${old}`, `이전 배너 ${i + 1} 이미지 삭제`);
      }
      renderBanners();
      toast(`배너 ${i + 1}을 저장했어요.`);
      afterSiteSave(`배너 ${i + 1} 반영 중`);
    });
  }
  function clearBanner(i) {
    const pick = state.bannerFiles[i];
    if (pick) { URL.revokeObjectURL(pick.url); state.bannerFiles[i] = null; }
    const old = state.site?.banners?.[i]?.image || "";
    if (!old) return renderBanners();
    run(async () => {
      await saveSite(`배너 ${i + 1} 비우기`, (s) => { s.banners[i] = { image: "", link: "", alt: "" }; return true; });
      if (SAFE_IMG.test(old)) await deleteFile(`public/${old}`, `배너 ${i + 1} 이미지 삭제`);
      renderBanners();
      toast(`배너 ${i + 1}을 비웠어요.`);
      afterSiteSave(`배너 ${i + 1} 비우기 반영 중`);
    });
  }

  function saveAds(e) {
    e.preventDefault();
    const client = $("#adClient").value.trim();
    if (client && !/^ca-pub-\d{16}$/.test(client)) return toast("게시자 ID는 ca-pub- 뒤에 숫자 16자리 형식이에요.", true);
    const slots = {};
    for (const [k, name] of SLOT_KEYS) {
      const v = $(`#slot-${k}`).value.replace(/\s/g, "");
      if (v && !/^\d{8,12}$/.test(v)) return toast(`${name}: 광고 단위 번호는 숫자만 넣어 주세요.`, true);
      slots[k] = v;
    }
    run(async () => {
      const feedEvery = [12, 24, 36, 48, 60].includes(+$("#feedEvery").value) ? +$("#feedEvery").value : 36;
      await saveSite("애드센스 설정 변경", (s) => { s.adsense = { client, slots, feedEvery }; return true; });
      renderAds();
      toast("광고 설정을 저장했어요.");
      afterSiteSave("광고 설정 반영 중");
    });
  }

  async function refresh() {
    await run(async () => {
      const [cfg, site] = await Promise.all([readJson(CONFIG), readJson(SITE, defaultSite), loadData()]);
      state.config = normConfig(cfg.data);
      state.site = normSite(site.data);
      state.menuDraft = null;
      renderAll();
    });
  }

  // ───────── 로그인 / 로그아웃 ─────────
  function showLogin(msg) {
    $("#app").hidden = true;
    $("#logout").hidden = true;
    $("#who").textContent = "";
    $("#login").hidden = false;
    const err = $("#loginErr");
    err.hidden = !msg;
    err.textContent = msg || "";
  }
  async function enter(auth) {
    state.auth = auth;
    const [user, cfg, site] = await Promise.all([gh("/user"), readJson(CONFIG), readJson(SITE, defaultSite)]);
    state.user = clean(user?.login, 40);
    state.config = normConfig(cfg.data);
    state.site = normSite(site.data);
    try { await loadData(); } catch (e) { state.videos = []; toast(e.message, true); }
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#logout").hidden = false;
    $("#who").textContent = state.user ? `@${state.user}` : "";
    renderAll();
  }
  function logout() {
    store.clear();
    state.auth = null;
    $("#token").value = "";
    showLogin();
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const repo = $("#repo").value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/+$/g, "");
    const token = $("#token").value.trim();
    if (!REPO_RE.test(repo)) return showLogin("저장소는 '아이디/저장소이름' 형식으로 넣어 주세요. 예: GGeagle-pro/All-AICinema");
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) return showLogin("GitHub 토큰 형식이 아니에요. github_pat_ 으로 시작하는 토큰을 붙여넣어 주세요.");
    const btn = $("#loginBtn");
    btn.disabled = true;
    btn.textContent = "확인 중…";
    try {
      await enter({ repo, token });
      store.save({ repo, token }, $("#remember").checked);
      $("#token").value = "";
    } catch (err) {
      state.auth = null;
      showLogin(explain(err));
    } finally {
      btn.disabled = false;
      btn.textContent = "로그인";
    }
  });

  // ───────── 이벤트 ─────────
  $("#logout").addEventListener("click", logout);
  document.querySelector(".adm-tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    document.querySelectorAll(".adm-tabs .tab").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
    for (const p of ["channels", "works", "videos", "hidden", "menu", "ads"]) $(`#tab-${p}`).hidden = p !== t.dataset.tab;
    t.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
  $("#addUrl").addEventListener("input", updateAddForm);
  $("#newCatSave").addEventListener("click", createCategory);
  $("#newCatCancel").addEventListener("click", () => openNewCat(false));
  $("#newCatName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); createCategory(); }
    if (e.key === "Escape") openNewCat(false);
  });
  $("#addForm").addEventListener("submit", addFromForm);
  $("#pasteBtn").addEventListener("click", async () => {
    try { $("#addUrl").value = (await navigator.clipboard.readText()).trim(); updateAddForm(); $("#addUrl").focus(); }
    catch { toast("붙여넣기 권한이 없어요. 주소 칸을 길게 누르거나 Ctrl+V 로 붙여넣어 주세요.", true); $("#addUrl").focus(); }
  });
  $("#chFilter").addEventListener("change", (e) => { state.ch = e.target.value; state.selected.clear(); renderVideos(); });
  let qt;
  $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; renderVideos(); }, 200); });
  $("#more").addEventListener("click", () => renderVideos(false));
  $("#selectAll").addEventListener("change", (e) => {
    for (const v of filtered()) if (!state.pending.has(v.id)) e.target.checked ? state.selected.add(v.id) : state.selected.delete(v.id);
    renderVideos();
  });
  $("#hideSelected").addEventListener("click", () => hide([...state.selected]));
  $("#menuAddForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = clean($("#menuNew").value, 30);
    if (!v) return;
    if (state.menuDraft.includes(v)) return toast("이미 있는 카테고리예요.", true);
    if (state.menuDraft.length >= 30) return toast("카테고리는 30개까지 만들 수 있어요.", true);
    state.menuDraft.push(v);
    $("#menuNew").value = "";
    renderMenu();
  });
  $("#menuSave").addEventListener("click", saveMenu);
  $("#adsForm").addEventListener("submit", saveAds);
  $("#openModeForm").addEventListener("submit", saveOpenMode);
  $("#worksQ").addEventListener("input", () => renderWorks());
  $("#stripAdd").addEventListener("click", addStrip);
  $("#worksSwitch").addEventListener("submit", saveWorksSwitch);

  // 시작
  const saved = store.load();
  if (saved) {
    $("#repo").value = saved.repo;
    enter(saved).catch((err) => { if (err.status === 401) store.clear(); showLogin(explain(err)); });
  } else {
    showLogin();
  }
})();

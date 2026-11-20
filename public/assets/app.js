/* All AI-Cinema – 프런트엔드
 *
 * 데이터
 *  - data/videos.json : 영상 목록 (GitHub Actions 가 자동 생성)
 *  - data/site.json   : 메뉴·광고 배너·애드센스 설정 (관리자 페이지에서 편집)
 *
 * 저작권·정책 준수
 *  - 영상은 YouTube 공식 임베드 플레이어로만 재생 (다운로드·가공 없음, 조회수는 원 채널에 반영)
 *  - 플레이어에 원본 영상·채널 링크 표시
 *  - 자체 배너에는 "광고" 표시, 외부 링크는 rel="sponsored noopener noreferrer"
 *  - 애드센스 고정(sticky) 광고는 정책상 데스크톱에서 한 개(오른쪽 세로 배너)만 사용
 *    상·하단 고정(앵커)과 전면(비네트) 광고는 애드센스 '자동 광고'에서 켭니다
 */
(() => {
  "use strict";

  // ===== 설정 =====
  const PAGE_SIZE = 24;
  const FEED_EVERY = 12;              // 카드 N개마다 목록 사이 광고 1개
  const REFRESH_MS = 10 * 60 * 1000;  // 열려 있는 페이지에서 10분마다 새 영상 확인
  const NEW_HOURS = 72;               // NEW 배지·NEW 메뉴 기준: 최근 3일
  const NEW_KEY = "__new__";          // 1줄 메뉴의 NEW 탭 (관리자 카테고리 이름과 겹치지 않는 내부 값)
  const RAIL_MIN_WIDTH = 1480;        // 이 너비 이상(데스크톱)에서만 양옆 세로 배너 표시
  const SITE_NAME_DEFAULT = "All AI-Cinema";

  // ===== 상태 =====
  const $ = (s) => document.querySelector(s);
  const state = {
    all: [], list: [], shown: 0,
    cat: "전체", ch: "", q: "", sort: "new",
    current: -1, latest: null, cids: [], avatars: {},
    site: { siteName: SITE_NAME_DEFAULT, menu: [], adsense: { client: "", slots: {} }, banners: [] },
  };
  let ytApi, ytPlayer;

  // ===== 유틸 =====
  // ── 보안: 외부(유튜브)에서 온 문자열은 항상 이 함수로 이스케이프한 뒤에만 HTML에 넣습니다
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VALID_ID = /^[\w-]{11}$/;                        // 유튜브 영상 ID 형식만 허용
  const CHANNEL_ID = /^UC[\w-]{22}$/;
  const THUMB_Q = new Set(["mqdefault", "hqdefault", "maxresdefault"]);
  const thumb = (id, q = "hqdefault") =>
    VALID_ID.test(id) && THUMB_Q.has(q) ? `https://i.ytimg.com/vi/${id}/${q}.jpg` : "";
  const fmtViews = (n) => !n ? "" : n >= 1e8 ? (n / 1e8).toFixed(1).replace(/\.0$/, "") + "억회" :
    n >= 1e4 ? (n / 1e4).toFixed(1).replace(/\.0$/, "") + "만회" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "천회" : n + "회";
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    if (s < 2592000) return Math.floor(s / 86400) + "일 전";
    if (s < 31536000) return Math.floor(s / 2592000) + "개월 전";
    return Math.floor(s / 31536000) + "년 전";
  };
  const isNew = (iso) => Date.now() - new Date(iso) < NEW_HOURS * 3600e3;
  const str = (x, max) => (typeof x === "string" ? x : "").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, " ").trim().slice(0, max);
  const safeLink = (u) => {
    try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch { return ""; }
  };
  const SAFE_IMG = /^uploads\/[\w.-]{1,80}\.(webp|png|jpe?g|gif)$/i;   // 관리자에서 올린 이미지 경로만 허용
  const siteName = () => state.site.siteName;

  // ===== 애드센스 =====
  const adClient = () => (/^ca-pub-\d{16}$/.test(state.site.adsense.client) ? state.site.adsense.client : "");
  // 광고 단위 번호: 숫자 8~12자리, 1111111111 같은 예시 번호는 무시
  const adSlot = (key) => {
    const s = String(state.site.adsense.slots?.[key] || "");
    return /^\d{8,12}$/.test(s) && !/^(\d)\1+$/.test(s) ? s : "";
  };
  function adIns(key, { fixed } = {}) {
    const client = adClient(), slot = adSlot(key);
    if (!client || !slot) return null;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    if (fixed) {
      ins.style.cssText = `display:inline-block;width:${fixed[0]}px;height:${fixed[1]}px`;
    } else {
      ins.style.display = "block";
      ins.dataset.adFormat = "auto";
      ins.dataset.fullWidthResponsive = "true";
    }
    ins.dataset.adClient = client;
    ins.dataset.adSlot = slot;
    return ins;
  }
  const pushAd = (ins) => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { ins?.remove(); } };
  function placeAd(boxSel, key, opts) {
    const box = typeof boxSel === "string" ? $(boxSel) : boxSel;
    if (!box) return;
    box.textContent = "";
    const ins = adIns(key, opts);
    box.hidden = !ins;
    if (ins) { box.appendChild(ins); pushAd(ins); }
  }
  function renderAds() {
    placeAd("#adTop", "top");
    placeAd("#adBottom", "bottom");
    // 양옆 세로 배너: 데스크톱에서만. 정책상 고정(sticky)은 오른쪽 하나만, 왼쪽은 페이지와 함께 스크롤
    const wide = matchMedia(`(min-width:${RAIL_MIN_WIDTH}px)`).matches;
    document.body.classList.toggle("has-rails", wide && !!(adSlot("left") || adSlot("right")));
    if (wide) { placeAd("#railL", "left", { fixed: [160, 600] }); placeAd("#railR", "right", { fixed: [160, 600] }); }
  }

  // ===== 자체 광고 배너 (관리자에서 편집, 3칸) =====
  function renderPromo() {
    const box = $("#promo");
    const items = (state.site.banners || []).slice(0, 3)
      .map((b) => ({ img: SAFE_IMG.test(b?.image || "") ? b.image : "", link: safeLink(b?.link || ""), alt: str(b?.alt, 80) }))
      .filter((b) => b.img);
    box.hidden = !items.length;
    box.style.setProperty("--cols", String(items.length || 1));
    box.innerHTML = items.map((b) => {
      const img = `<img src="${esc(b.img)}" alt="${esc(b.alt || "광고 배너")}" loading="lazy" decoding="async" /><span class="promo__label">광고</span>`;
      return b.link
        ? `<a class="promo__item" href="${esc(b.link)}" target="_blank" rel="sponsored noopener noreferrer">${img}</a>`
        : `<div class="promo__item">${img}</div>`;
    }).join("");
  }

  // ===== 데이터 =====
  // ── 보안: 데이터 파일 내용도 믿지 않고 형식·길이를 검사해서 정상 항목만 사용
  function clean(v) {
    if (!v || !VALID_ID.test(v.id)) return null;
    const t = Date.parse(v.published);
    const cats = (Array.isArray(v.categories) ? v.categories : [v.category]).map((c) => str(c, 30)).filter(Boolean);
    return {
      id: v.id,
      title: str(v.title, 200) || "(제목 없음)",
      channel: str(v.channel, 80),
      cid: CHANNEL_ID.test(v.cid || "") ? v.cid : "",
      categories: cats.length ? [...new Set(cats)] : ["기타"],
      published: new Date(Number.isFinite(t) ? t : 0).toISOString(),
      views: Number.isSafeInteger(v.views) && v.views > 0 ? v.views : 0,
      short: v.short === true,
      ...(typeof v.description === "string" ? { description: str(v.description.replace(/\n/g, "\u2029"), 1000).replace(/\u2029/g, "\n") } : {}),
    };
  }
  function parseIndex(data) {
    if (!data || typeof data !== "object") return [];
    const raw = Array.isArray(data.videos) ? data.videos
      : Array.isArray(data.items) ? data.items.map((r) => Array.isArray(r) ? {
          id: r[0], title: r[1], channel: data.channels?.[r[2]],
          categories: (Array.isArray(r[3]) ? r[3] : [r[3]]).map((i) => data.cats?.[i]),
          published: new Date(Number(r[4]) * 1000).toISOString(), views: r[5], short: r[6] === 1,
          cid: data.cids?.[r[7]],
        } : null) : [];
    const seen = new Set();
    return raw.slice(0, 5000).map(clean).filter((v) => v && !seen.has(v.id) && seen.add(v.id));
  }

  // 채널 프로필 사진: 유튜브 이미지 서버(yt3) 주소만 허용
  const AVATAR_URL = /^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[\w\-./=~%]{10,500}$/;
  function parseAvatars(a) {
    const out = {};
    if (a && typeof a === "object") for (const [cid, u] of Object.entries(a)) if (/^UC[\w-]{22}$/.test(cid) && AVATAR_URL.test(u)) out[cid] = u;
    return out;
  }
  function avatarOf(name) {
    const v = state.all.find((x) => x.channel === name && x.cid && state.avatars[x.cid]);
    return v ? state.avatars[v.cid] : "";
  }
  // 채널 아이콘: 프로필 사진이 있으면 사진, 없거나 못 불러오면 첫 글자
  function avatarHtml(name, cls = "chtab__av", cid = "") {
    const url = (cid && state.avatars[cid]) || avatarOf(name);
    return `<span class="${cls}" aria-hidden="true">${esc(String(name || "?").trim()[0] || "?")}` +
      (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="26" height="26" />` : "") + `</span>`;
  }

  async function loadSite() {
    try {
      const r = await fetch("data/site.json", { cache: "no-cache" });
      if (!r.ok) return;
      const s = await r.json();
      if (!s || typeof s !== "object") return;
      state.site = {
        siteName: str(s.siteName, 40) || SITE_NAME_DEFAULT,
        menu: (Array.isArray(s.menu) ? s.menu : []).map((m) => str(m, 30)).filter(Boolean).slice(0, 30),
        adsense: {
          client: str(s.adsense?.client, 30),
          slots: Object.fromEntries(Object.entries(s.adsense?.slots || {}).map(([k, v]) => [str(k, 20), str(String(v ?? ""), 12)])),
        },
        banners: Array.isArray(s.banners) ? s.banners.slice(0, 3) : [],
        // 영상 여는 방식: "page" = 목록에서 누르면 실제로 영상 페이지로 이동(애드센스 전면 광고 기회),
        //                 "inline" = 페이지 이동 없이 바로 플레이어 열기 (관리자 > 광고 설정에서 변경)
        openMode: s.openMode === "page" ? "page" : "inline",
      };
    } catch {}
  }

  // 설명은 플레이어를 처음 열 때 한 번만 받음 (목록 로딩을 가볍게)
  let descPromise;
  const getDesc = () => (descPromise ||= fetch("data/desc.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => (d && typeof d === "object" && !Array.isArray(d) ? d : {}))
    .catch(() => ({})));

  // 새 영상 확인: 먼저 100바이트짜리 meta.json만 받아 비교하고, 바뀌었을 때만 전체 목록을 받음
  async function checkUpdate() {
    if (document.hidden) return;
    try {
      const r = await fetch("data/meta.json", { cache: "no-cache" });
      if (!r.ok) return;
      const m = await r.json();
      if (m.generatedAt && m.generatedAt !== state.latest) { descPromise = null; await load(false); }
    } catch {}
    refreshNew();
  }

  // NEW 메뉴는 "지금으로부터 3일"이라 시간이 지나면 저절로 바뀜 → 확인할 때마다 개수와 목록을 다시 맞춤
  function refreshNew() {
    const cur = $(`#cats .tab--new`);
    if (cur) cur.outerHTML = newTab();
    if (state.cat !== NEW_KEY || state.q || !$("#player").hidden) return;
    const ids = state.all.filter((v) => inCat(v) && (!state.ch || v.channel === state.ch)).map((v) => v.id).sort().join();
    if (ids !== state.list.map((v) => v.id).sort().join() && scrollY < 400) { renderMenus(); apply(); }
  }

  async function load(initial) {
    // cache:"no-cache" → 서버(또는 CDN)에 "바뀌었나?"만 물어보고, 안 바뀌었으면 304로 본문 없이 재사용
    const res = await fetch("data/videos.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("데이터를 불러오지 못했습니다");
    const data = await res.json();
    const vids = parseIndex(data);
    state.latest = data.generatedAt;
    state.avatars = parseAvatars(data.avatars);
    $("#meta").textContent = data.generatedAt ? `업데이트 ${ago(data.generatedAt)}` : "";
    if (initial) {
      state.all = vids;
      renderMenus();
      apply();
      return;
    }
    const known = new Set(state.all.map((v) => v.id));
    const fresh = vids.filter((v) => !known.has(v.id));
    if (fresh.length) {
      const t = $("#toast");
      t.textContent = `새 영상 ${fresh.length}개 ↑`;
      t.hidden = false;
      t.onclick = () => { t.hidden = true; state.all = vids; renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" }); };
    }
  }

  // ===== 메뉴 (1줄: 장르·국가, 2줄: 유튜브 채널) =====
  const inCat = (v, cat = state.cat) => cat === "전체" || (cat === NEW_KEY ? isNew(v.published) : v.categories.includes(cat));
  const newCount = () => state.all.reduce((n, v) => n + (isNew(v.published) ? 1 : 0), 0);
  // 1줄 메뉴 항목 + 영상 개수 (NEW 탭과 같은 모양)
  const countLabel = (n) => (n > 999 ? "999+" : String(n));
  function catTab(c, n) {
    return `<button type="button" class="tab tab--count" data-key="${esc(c)}" aria-pressed="${c === state.cat}" aria-label="${esc(c)} 영상 ${n}개">` +
      `${esc(c)}<span class="tab__count" aria-hidden="true">${countLabel(n)}</span></button>`;
  }
  function newTab() {
    const n = newCount();
    return `<button type="button" class="tab tab--new" data-key="${NEW_KEY}" aria-pressed="${state.cat === NEW_KEY}" aria-label="NEW: 최근 3일 새 영상 ${n}개">` +
      `<span class="tab__new" aria-hidden="true">NEW</span><span class="tab__count" aria-hidden="true">${countLabel(n)}</span></button>`;
  }
  function catList() {
    if (state.site.menu.length) return state.site.menu;
    return [...new Set(state.all.flatMap((v) => v.categories))];   // 메뉴를 정하지 않았으면 영상의 카테고리로 자동 구성
  }
  function chip(cls, key, label, pressed, extra = "") {
    return `<button type="button" class="${cls}" data-key="${esc(key)}" aria-pressed="${pressed}">${extra}${esc(label)}</button>`;
  }
  function renderMenus() {
    // 전체 → NEW(최근 3일) → 관리자에서 정한 카테고리
    $("#cats").innerHTML = catTab("전체", state.all.length) + newTab() +
      catList().map((c) => catTab(c, state.all.reduce((n, v) => n + (v.categories.includes(c) ? 1 : 0), 0))).join("");
    // 2줄: 현재 고른 장르·국가에 영상이 있는 채널만, 영상 많은 순
    const counts = new Map();
    for (const v of state.all) if (inCat(v) && v.channel) counts.set(v.channel, (counts.get(v.channel) || 0) + 1);
    const chs = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    if (state.ch && !counts.has(state.ch)) state.ch = "";
    $("#chs").innerHTML = chip("chtab", "", "모든 채널", !state.ch) +
      chs.map((c) => chip("chtab", c, c, c === state.ch, avatarHtml(c))).join("");
    $("#chrow").hidden = !chs.length;
    requestAnimationFrame(updateChMore);
  }

  // 2줄(채널)이 화면 너비를 넘치면 ＋ 버튼 표시 → 누르면 여러 줄로 펼침, － 로 접기
  function updateChMore() {
    const wrap = $("#chrow"), row = $("#chs"), btn = $("#chMore");
    const open = wrap.classList.contains("open");
    const overflow = row.scrollWidth > row.clientWidth + 4;
    btn.hidden = !(open || overflow);
    btn.textContent = open ? "−" : "+";
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "채널 목록 접기" : "채널 모두 펼치기");
  }
  function setChOpen(open) {
    $("#chrow").classList.toggle("open", open);
    updateChMore();
    if (!open) $("#chs .chtab[aria-pressed=\"true\"]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function apply() {
    const q = state.q.trim().toLowerCase();
    let list = state.all.filter((v) => inCat(v) && (!state.ch || v.channel === state.ch) &&
      (!q || (v.title + " " + v.channel).toLowerCase().includes(q)));
    list = state.sort === "views" ? list.sort((a, b) => b.views - a.views)
                                  : list.sort((a, b) => new Date(b.published) - new Date(a.published));
    state.list = list;
    state.shown = 0;
    $("#grid").innerHTML = "";
    const where = [state.cat === NEW_KEY ? "NEW · 최근 3일 새 영상" : state.cat !== "전체" ? state.cat : "", state.ch].filter(Boolean).join(" · ");
    $("#listTitle").textContent = q ? `"${state.q}" 검색 결과 ${list.length}개` : where || "최신 영상";
    renderHero();
    const empty = $("#empty");
    empty.hidden = list.length > 0;
    syncListUrl();
    empty.textContent = !state.all.length ? "아직 수집된 영상이 없습니다."
      : state.cat === NEW_KEY ? "최근 3일 동안 새로 올라온 영상이 없어요." : "이 메뉴에는 아직 영상이 없어요.";
    more();
  }

  function renderHero() {
    const hero = $("#hero");
    const v = !state.q && state.sort === "new" ? state.list[0] : null;
    if (!v) { hero.hidden = true; return; }
    hero.hidden = false;
    hero.innerHTML = `<img src="${thumb(v.id, "maxresdefault")}" alt="" />
      <div class="hero__body">
        <span class="hero__label">${isNew(v.published) ? "NEW · " : ""}최신 업로드</span>
        <h2>${esc(v.title)}</h2>
        <p class="muted">${esc(v.channel)} · ${ago(v.published)}${v.views ? " · 조회수 " + fmtViews(v.views) : ""}</p>
        <button class="hero__play" type="button">▶ 지금 보기</button>
      </div>`;
    const img = hero.querySelector("img");
    img.addEventListener("error", () => { img.src = thumb(v.id); }, { once: true }); // 고화질 썸네일이 없을 때
    hero.onclick = () => (pageMode() ? goToVideo(state.list[0]) : openPlayer(0));
  }

  function card(v, i) {
    return `<a class="card" href="?v=${v.id}" data-i="${i}">
      <div class="thumb">
        ${isNew(v.published) ? '<span class="badge">NEW</span>' : ""}
        ${v.short ? '<span class="badge badge--short">Shorts</span>' : ""}
        <img loading="lazy" decoding="async" src="${thumb(v.id, "mqdefault")}" width="320" height="180" alt="" />
      </div>
      <div class="card__body">
        ${avatarHtml(v.channel, "avatar", v.cid)}
        <div><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p>
        <p>${v.views ? "조회수 " + fmtViews(v.views) + " · " : ""}${ago(v.published)}</p></div>
      </div></a>`;
  }

  function more() {
    const grid = $("#grid");
    const start = state.shown, end = Math.min(start + PAGE_SIZE, state.list.length);
    if (start >= end) return;
    const frag = document.createDocumentFragment();
    const tmp = document.createElement("div");
    const newAds = [];
    for (let i = start; i < end; i++) {
      tmp.innerHTML = card(state.list[i], i);
      frag.appendChild(tmp.firstElementChild);
      if ((i + 1) % FEED_EVERY === 0 && i + 1 < state.list.length) {
        const ins = adIns("feed");
        if (ins) { const box = document.createElement("div"); box.className = "ad ad--feed"; box.appendChild(ins); frag.appendChild(box); newAds.push(ins); }
      }
    }
    grid.appendChild(frag);
    newAds.forEach(pushAd);
    state.shown = end;
  }

  // ===== 플레이어 (페이지 이탈 없이 재생) =====
  function loadYT() {
    if (ytApi) return ytApi;
    ytApi = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = resolve;
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
    return ytApi;
  }

  async function play(v) {
    await loadYT();
    if (ytPlayer && ytPlayer.loadVideoById) { ytPlayer.loadVideoById(v.id); return; }
    ytPlayer = new YT.Player("yt", {
      host: "https://www.youtube-nocookie.com",
      videoId: v.id,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED && $("#pAuto").checked) step(1); },
        onError: () => { if ($("#pAuto").checked) setTimeout(() => step(1), 1500); },
      },
    });
  }

  function openPlayer(i, { push = true } = {}) {
    const v = state.list[i];
    if (!v) return;
    state.current = i;
    const p = $("#player");
    const wasOpen = !p.hidden;
    p.hidden = false;
    document.body.classList.add("locked");

    $("#pTitle").textContent = v.title;
    $("#pChannel").innerHTML = avatarHtml(v.channel, "avatar avatar--sm", v.cid) + `<span>${esc(v.channel)}</span>`;
    $("#pMeta").textContent = [v.views && "조회수 " + fmtViews(v.views), ago(v.published)].filter(Boolean).join(" · ");
    // 원본 영상·채널 링크 (저작자 표시)
    $("#pYoutube").href = `https://www.youtube.com/watch?v=${v.id}`;
    const chLink = $("#pChannelLink");
    chLink.hidden = !v.cid;
    if (v.cid) chLink.href = `https://www.youtube.com/channel/${v.cid}`;
    $("#pDesc").textContent = v.description || "";
    $("#pDesc").hidden = !v.description;
    if (v.description === undefined) getDesc().then((d) => {
      v.description = typeof d[v.id] === "string" ? clean({ ...v, description: d[v.id] }).description : "";
      if (state.list[state.current] === v) { $("#pDesc").textContent = v.description; $("#pDesc").hidden = !v.description; }
    });
    $("#pPrev").disabled = i === 0;
    $("#pNext").disabled = i >= state.list.length - 1;
    document.title = `${v.title} – ${siteName()}`;

    // 다음 영상 목록
    const next = state.list.slice(i + 1, i + 21);
    $("#upnext").innerHTML = next.map((n, k) =>
      `<li data-i="${i + 1 + k}"><img loading="lazy" src="${thumb(n.id, "mqdefault")}" alt="" />
       <div><b>${esc(n.title)}</b><span>${esc(n.channel)} · ${ago(n.published)}</span></div></li>`).join("");

    // 플레이어 아래 광고 (영상 위를 가리지 않도록 정보 영역 아래에 배치)
    placeAd("#playerAd", "player");

    $(".player__main").scrollTop = 0;
    if (innerWidth <= 1100) $(".player__panel").scrollTop = 0;

    // 주소 갱신: 공유 가능 + 모바일 뒤로가기로 닫기
    const url = "?v=" + v.id;
    if (push && !wasOpen) history.pushState({ v: v.id }, "", url);
    else history.replaceState({ v: v.id }, "", url);

    play(v);
    if (!wasOpen) $(".player__close").focus({ preventScroll: true });
  }

  function closePlayer({ fromPop = false } = {}) {
    const p = $("#player");
    if (p.hidden) return;
    p.hidden = true;
    document.body.classList.remove("locked");
    try { ytPlayer?.stopVideo(); } catch {}
    document.title = `${siteName()} | AI 영화·드라마 모아보기`;
    if (!fromPop && backToList) { backToList = false; history.back(); return; }
    if (!fromPop) history.state?.v ? history.back() : history.replaceState(null, "", location.pathname);
    const c = document.querySelector(`.card[data-i="${state.current}"]`);
    c?.focus({ preventScroll: true });
  }

  const step = (d) => {
    const i = state.current + d;
    if (i >= 0 && i < state.list.length) openPlayer(i, { push: false });
  };

  // ===== 모바일: 아래로 스크롤하면 헤더 숨김, 위로 올리면 다시 표시 =====
  function bindHeaderAutoHide() {
    const bar = $("#topbar");
    const mobile = matchMedia("(max-width:760px)");
    let lastY = scrollY, ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY;
        const hide = mobile.matches && y > 160 && y > lastY && !bar.classList.contains("search-open");
        bar.classList.toggle("topbar--hidden", hide);
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  // 헤더 실제 높이를 CSS 변수(--hdr)로 → 오른쪽 고정 배너·알림 위치 계산
  function trackHeaderHeight() {
    const bar = $("#topbar");
    const set = () => document.documentElement.style.setProperty("--hdr", bar.offsetHeight + "px");
    set();
    if ("ResizeObserver" in window) new ResizeObserver(set).observe(bar);
  }

  // ===== 이벤트 =====
  function bind() {
    trackHeaderHeight();
    $("#grid").addEventListener("click", (e) => {
      const c = e.target.closest(".card");
      if (!c || e.metaKey || e.ctrlKey || e.shiftKey) return; // 새 탭 열기는 허용
      e.preventDefault();
      if (pageMode()) return goToVideo(state.list[+c.dataset.i]);
      openPlayer(+c.dataset.i);
    });
    const pick = (row, t) => {
      row.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
      t.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    };
    $("#cats").addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      state.cat = t.dataset.key;
      pick($("#cats"), t);
      renderMenus();
      apply();
    });
    // 프로필 사진을 못 불러오면 사진만 지우고 첫 글자를 보여줌 (인라인 onerror는 보안 정책상 사용 안 함)
    document.addEventListener("error", (e) => { if (e.target.tagName === "IMG" && e.target.parentElement?.matches(".avatar, .chtab__av")) e.target.remove(); }, true);
    $("#chs").addEventListener("click", (e) => {
      const t = e.target.closest(".chtab");
      if (!t) return;
      state.ch = t.dataset.key;
      pick($("#chs"), t);
      if ($("#chrow").classList.contains("open")) setChOpen(false);   // 고르면 다시 접기
      apply();
    });
    $(".search").addEventListener("submit", (e) => { e.preventDefault(); $("#q").blur(); });
    let qt;
    $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; apply(); }, 200); });
    $("#searchBtn").addEventListener("click", () => {
      const bar = $("#topbar");
      const open = !bar.classList.contains("search-open");
      bar.classList.toggle("search-open", open);
      $("#searchBtn").setAttribute("aria-expanded", String(open));
      if (open) $("#q").focus();
    });
    $("#chMore").addEventListener("click", () => setChOpen(!$("#chrow").classList.contains("open")));
    let rt;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(updateChMore, 150); }, { passive: true });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });

    $("#player").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closePlayer(); });
    $("#upnext").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) openPlayer(+li.dataset.i, { push: false }); });
    $("#pPrev").onclick = () => step(-1);
    $("#pNext").onclick = () => step(1);
    $("#pShare").onclick = async () => {
      const v = state.list[state.current];
      const url = location.origin + location.pathname + "?v=" + v.id;
      const b = $("#pShare");
      try {
        if (navigator.share) await navigator.share({ title: v.title, url });
        else { await navigator.clipboard.writeText(url); b.textContent = "링크 복사됨"; setTimeout(() => (b.textContent = "공유"), 1600); }
      } catch {}
    };
    try { $("#pAuto").checked = localStorage.getItem("autoNext") !== "0"; } catch {}
    $("#pAuto").onchange = (e) => { try { localStorage.setItem("autoNext", e.target.checked ? "1" : "0"); } catch {} };

    addEventListener("keydown", (e) => {
      if ($("#player").hidden) return;
      if (e.key === "Escape") closePlayer();
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowRight" && e.shiftKey) step(1);
      if (e.key === "ArrowLeft" && e.shiftKey) step(-1);
    });
    addEventListener("popstate", () => {
      const id = new URLSearchParams(location.search).get("v");
      if (!id || !VALID_ID.test(id)) closePlayer({ fromPop: true });
      else openById(id, false);
    });

    new IntersectionObserver((es) => es[0].isIntersecting && more(), { rootMargin: "800px" }).observe($("#sentinel"));
    setInterval(checkUpdate, REFRESH_MS);
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - lastCheck > 60e3) { lastCheck = Date.now(); checkUpdate(); }
    });
    bindHeaderAutoHide();
  }

  // ── "page" 방식: 영상 페이지로 실제 이동 (지금 보던 카테고리·채널은 주소에 담아 이어서 보여줌)
  const pageMode = () => state.site.openMode === "page";
  function listQuery() {
    const q = new URLSearchParams();
    if (state.cat !== "전체") q.set("c", state.cat);
    if (state.ch) q.set("ch", state.ch);
    if (state.sort !== "new") q.set("s", state.sort);
    return q;
  }
  // 목록 화면 주소에 지금 고른 카테고리·채널을 담아둠 → 영상 페이지에서 돌아와도 그대로
  let urlReady = false;   // 첫 로딩에서 주소의 v·c·ch 를 읽기 전에는 주소를 바꾸지 않음
  function syncListUrl() {
    if (!urlReady || !pageMode() || !$("#player").hidden) return;
    const qs = listQuery().toString();
    const want = location.pathname + (qs ? "?" + qs : "");
    if (location.pathname + location.search !== want) history.replaceState(null, "", want);
  }
  function goToVideo(v) {
    if (!v || !VALID_ID.test(v.id)) return;
    syncListUrl();
    // 돌아왔을 때 보던 위치로 스크롤하기 위해 저장 (이 브라우저 탭에만, 실패해도 무시)
    try { sessionStorage.setItem("aic:list", JSON.stringify({ at: location.search, y: scrollY, shown: state.shown })); } catch {}
    const q = listQuery(); q.set("v", v.id);
    location.assign("?" + q.toString());
  }
  function restoreListPosition() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("aic:list") || "null"); sessionStorage.removeItem("aic:list"); } catch {}
    if (!saved || saved.at !== location.search || !Number.isFinite(saved.y)) return;
    while (state.shown < Math.min(saved.shown || 0, state.list.length)) { const before = state.shown; more(); if (state.shown === before) break; }
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    requestAnimationFrame(() => scrollTo(0, saved.y));
  }
  // 이 사이트의 목록 화면에서 넘어왔으면 "닫기"를 누를 때 그 화면(보던 스크롤 위치)으로 돌아감
  let backToList = false;

  function openById(id, push) {
    if (!VALID_ID.test(id)) return;
    let i = state.list.findIndex((v) => v.id === id);
    if (i < 0) { // 목록에 없는 영상(공유 링크 등)도 재생
      const v = state.all.find((x) => x.id === id) || { id, title: "", channel: "", cid: "", categories: [], published: new Date().toISOString() };
      state.list.unshift(v); i = 0;
    }
    openPlayer(i, { push });
  }

  // ── 보안: 다른 사이트가 이 페이지를 iframe에 넣어 클릭을 유도(클릭재킹)하지 못하게 차단
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch { document.documentElement.hidden = true; return; }
  }

  // 로딩 중 스켈레톤
  $("#grid").innerHTML = Array.from({ length: 8 }, () =>
    '<div class="card skeleton"><div class="thumb"></div><div class="line" style="width:90%"></div><div class="line" style="width:55%"></div></div>').join("");

  bind();
  loadSite().then(() => {
    renderAds();
    renderPromo();
    return load(true);
  }).then(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("v");
    // 보던 카테고리·채널·정렬 이어서 보기 (영상 페이지 ↔ 목록 오갈 때)
    const c = params.get("c"), ch = params.get("ch"), so = params.get("s");
    if (c && (c === NEW_KEY || catList().includes(c))) state.cat = c;
    if (ch && state.all.some((v) => v.channel === ch)) state.ch = ch;
    if (so === "views") { state.sort = "views"; $("#sort").value = "views"; }
    urlReady = true;
    if (c || ch || so) { renderMenus(); apply(); }
    if (!id) restoreListPosition();
    if (id && VALID_ID.test(id)) {
      let fromList = false;
      try { fromList = pageMode() && !!document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1; } catch {}
      if (fromList) {
        backToList = true;
        history.replaceState({ v: id }, "", "?v=" + id);
        openById(id, false);
      } else {
        history.replaceState(null, "", location.pathname);
        openById(id, true);
      }
    }
  }).catch((err) => {
    $("#grid").innerHTML = "";
    const e = $("#empty"); e.hidden = false; e.textContent = err.message;
  });
})();

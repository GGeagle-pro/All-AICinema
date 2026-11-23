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
  const FEED_EVERY_DEFAULT = 36;      // 카드 N개마다 목록 사이 광고 1개 (관리자 > 광고 설정에서 변경)
  const feedEvery = () => { const n = +state.site.adsense?.feedEvery; return Number.isInteger(n) && n >= 6 && n <= 120 ? n : FEED_EVERY_DEFAULT; };
  const REFRESH_MS = 10 * 60 * 1000;  // 열려 있는 페이지에서 10분마다 새 영상 확인
  const NEW_HOURS = 72;               // NEW 배지·NEW 메뉴 기준: 최근 3일
  const BINGE_KEY = "__binge__";      // 1줄 메뉴의 "몰아보기" 탭 (제목으로 자동 분류: 몰아보기·모아보기·통합본·완결판…)
  const BINGE_RE = /몰아\s?보기|모아\s?보기|통합본|완결판|전편|합본|complete\s+series|full\s+series/i;
  const isBinge = (v) => BINGE_RE.test(v.title);
  const NEW_KEY = "__new__";
  const FAV_KEY = "__fav__", HIST_KEY = "__hist__", SINCE_KEY = "__since__";   // 찜한 영상 · 최근 본 영상 · 지난 방문 이후

  // ===== 내 목록: 찜·시청 기록·지난 방문 시각 – 이 브라우저에만 저장 (서버로 보내지 않음) =====
  const my = {
    get(k) { try { const a = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string" && /^[\w-]{11}$/.test(x)) : []; } catch { return []; } },
    set(k, a) { try { localStorage.setItem(k, JSON.stringify(a.slice(0, 100))); } catch {} },
  };
  const fav = new Set(my.get("aic:fav").reverse());   // 저장은 최신순, Set 은 오래된 것부터
  let hist = my.get("aic:hist");
  let since = 0;   // 지난 방문 시각 (ms)
  function toggleFav(id) {
    if (fav.has(id)) fav.delete(id); else fav.add(id);
    my.set("aic:fav", [...fav].reverse());
    return fav.has(id);
  }
  function addHist(id) { hist = [id, ...hist.filter((x) => x !== id)].slice(0, 50); my.set("aic:hist", hist); }
  const byIds = (ids) => { const m = new Map(state.all.map((v) => [v.id, v])); return ids.map((id) => m.get(id)).filter(Boolean); };
  const SPECIAL = { [FAV_KEY]: "찜한 영상", [HIST_KEY]: "최근 본 영상", [SINCE_KEY]: "지난 방문 이후 새 영상" };          // 1줄 메뉴의 NEW 탭 (관리자 카테고리 이름과 겹치지 않는 내부 값)
  const RAIL_MIN_WIDTH = 1280;        // 이 너비 이상(데스크톱)에서만 양옆 세로 배너 표시
  const SITE_NAME_DEFAULT = "All AI-Cinema";

  // ===== 상태 =====
  const $ = (s) => document.querySelector(s);
  const state = {
    all: [], list: [], shown: 0,
    cat: "전체", ch: "", q: "", sort: "new", country: "", work: "",
    current: -1, latest: null, cids: [], avatars: {}, queue: [],
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
  // ── 다국어 (assets/i18n.js): T(한국어 원문, 값) → 고른 언어, nm(장르·국가 이름) → 고른 언어
  const I18N = window.AIC_I18N || { t: (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m) : s), name: (x) => x, views: (n) => (n ? `조회수 ${n}회` : ""), viewsShort: (n) => String(n || ""), ago: () => "", applyStatic() {}, setLang() {}, LANGS: [], lang: "ko", meta: { yt: "ko" } };
  const T = (s, v) => I18N.t(s, v);
  // 통계(구글 애널리틱스) 기록: 실패해도 사이트 동작에는 영향 없음
  const track = (name, params = {}) => { try { if (typeof window.gtag === "function") window.gtag("event", name, { ...params, ui_lang: I18N.lang }); } catch {} };
  const nm = (x) => I18N.name(x);
  const views = (n) => I18N.views(n);         // "조회수 1.2만회" / "12K views" / "1.2万回視聴" / "1.2万次观看"
  const ago = (iso) => I18N.ago(iso);
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
    const ok = (k) => { const s = String(state.site.adsense.slots?.[k] || ""); return /^\d{8,12}$/.test(s) && !/^(\d)\1+$/.test(s) ? s : ""; };
    // 양옆 세로 광고: 한쪽 번호만 넣어도 양쪽에 같은 광고 단위 사용
    if (key === "left") return ok("left") || ok("right");
    if (key === "right") return ok("right") || ok("left");
    return ok(key);
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
    // 양옆 세로 배너: 데스크톱에서만, 양쪽 모두 페이지와 함께 스크롤 (애드센스 정책: 양쪽 대칭 고정 광고 금지)
    const wide = matchMedia(`(min-width:${RAIL_MIN_WIDTH}px)`).matches;
    document.body.classList.toggle("has-rails", wide && !!(adSlot("left") || adSlot("right")));
    if (wide) { placeAd("#railL", "left", { fixed: [160, 600] }); placeAd("#railR", "right", { fixed: [160, 600] }); }
  }

  // ===== 자체 광고 배너 (관리자에서 편집, 3칸) =====
  // 예약 광고: 지금(방문자 기기 시각, UTC 기준 비교) 진행 중인 것 중 가장 늦게 시작한 것 → 없으면 기본 광고
  function nowCreative(slot) {
    if (!slot || typeof slot !== "object") return slot;
    const now = Date.now();
    const live = (Array.isArray(slot.sched) ? slot.sched : [])
      .map((c) => ({ ...c, s: Date.parse(c?.start), e: Date.parse(c?.end) }))
      .filter((c) => c && SAFE_IMG.test(c.image || "") && c.s <= now && now < c.e)
      .sort((a, b) => b.s - a.s)[0];
    if (!live) return slot;
    return { ...slot, image: live.image, link: live.link || "", alt: live.alt || "", ...(live.target ? { target: live.target } : {}), ...("note" in live ? { note: live.note } : {}) };
  }
  function renderPromo() {
    const box = $("#promo");
    // 칸마다 보여 줄 방문자: all(모두) / kr(국내만) / intl(해외만) – 띠 배너와 같은 규칙
    const kr = isKrVisitor();
    const items = (state.site.banners || []).slice(0, 3)
      .map((b) => ({ img: SAFE_IMG.test(b?.image || "") ? b.image : "", link: safeLink(b?.link || ""), alt: str(b?.alt, 80),
        target: ["kr", "intl"].includes(b?.target) ? b.target : "all", note: str(b?.note, 140) }))
      .filter((b) => b.img && (b.target === "all" || (b.target === "kr") === kr));
    box.hidden = !items.length;
    box.style.setProperty("--cols", String(items.length || 1));
    box.innerHTML = items.map((b) => {
      const img = `<img src="/${esc(b.img)}" alt="${esc(b.alt || T("광고 배너"))}" loading="lazy" decoding="async" /><span class="promo__label">${T("광고")}</span>`;
      const box = b.link
        ? `<a class="promo__item" href="${esc(b.link)}" target="_blank" rel="sponsored noopener noreferrer">${img}</a>`
        : `<div class="promo__item">${img}</div>`;
      return b.note ? `<div class="promo__cell">${box}<p class="promo__note">${esc(b.note)}</p></div>` : box;
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
      series: str(v.series, 40),   // 작품(시리즈) 이름 – 수집할 때 재생목록·제목으로 자동 분류
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
          series: Number.isInteger(r[9]) && r[9] >= 0 ? data.series?.[r[9]] : "",
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
      const r = await fetch("/data/site.json", { cache: "no-cache" });
      if (!r.ok) return;
      const s = await r.json();
      if (!s || typeof s !== "object") return;
      state.site = {
        siteName: str(s.siteName, 40) || SITE_NAME_DEFAULT,
        menu: (Array.isArray(s.menu) ? s.menu : []).map((m) => str(m, 30)).filter(Boolean).slice(0, 30),
        // 나라 줄 (맨 위). 관리자의 카테고리 중 이 이름들은 장르 줄이 아니라 나라 줄에 나옴
        countries: (Array.isArray(s.countries) ? s.countries : ["한국", "미국", "일본", "중국"]).map((m) => str(m, 20)).filter(Boolean).slice(0, 12),
        genres: (Array.isArray(s.genres) ? s.genres : []).map((m) => str(m, 30)).filter(Boolean).slice(0, 30),   // 국가 이름이지만 장르로 쓰는 것
        adsense: {
          client: str(s.adsense?.client, 30),
          slots: Object.fromEntries(Object.entries(s.adsense?.slots || {}).map(([k, v]) => [str(k, 20), str(String(v ?? ""), 12)])),
          feedEvery: +s.adsense?.feedEvery || 0,
        },
        // 배너 칸마다 '기본(상시) 광고' + 예약 광고(sched: 시작~끝 시각). 지금 진행 중인 예약이 있으면 그걸, 없으면 기본을 보여 줌
        banners: (Array.isArray(s.banners) ? s.banners.slice(0, 3) : []).map(nowCreative),
        // 목록 사이 띠 배너 (관리자 > 광고 설정): 6:1 이미지 + 랜딩 URL + 문구
        // target: all(모두) / kr(국내 방문자만) / intl(해외 방문자만), note: 제휴 고지 문구 (예: 쿠팡파트너스)
        strips: (Array.isArray(s.strips) ? s.strips : []).slice(0, 6).map(nowCreative)
          .map((b, slot) => ({ slot, image: SAFE_IMG.test(b?.image || "") ? b.image : "", alt: str(b?.alt, 80), link: safeLink(b?.link || ""),
            target: ["kr", "intl"].includes(b?.target) ? b.target : "all", note: str(b?.note, 140) }))
          .filter((b) => b.image && b.link),
        // 영상 여는 방식: "page" = 목록에서 누르면 실제로 영상 페이지로 이동(애드센스 전면 광고 기회),
        //                 "inline" = 페이지 이동 없이 바로 플레이어 열기 (관리자 > 광고 설정에서 변경)
        openMode: s.openMode === "page" ? "page" : "inline",
        works: s.works !== false,
        stripsSame: s.stripsSame === true,   // 관리자 체크: 1번 띠 배너를 모든 띠 배너 자리에 똑같이
        kakaoKey: /^[0-9a-f]{32}$/.test(s.kakaoKey || "") ? s.kakaoKey : "",   // 카카오 JavaScript 키 (공개용 키, 등록한 도메인에서만 동작)
        pages: s.pages !== false,   // 검색용 작품·영상 페이지 (관리자 > 작품 탭에서 끄면 예전 주소로)
      };
    } catch {}
  }

  // 설명은 플레이어를 처음 열 때 한 번만 받음 (목록 로딩을 가볍게)
  let descPromise;
  const getDesc = () => (descPromise ||= fetch("/data/desc.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => (d && typeof d === "object" && !Array.isArray(d) ? d : {}))
    .catch(() => ({})));

  // 새 영상 확인: 먼저 100바이트짜리 meta.json만 받아 비교하고, 바뀌었을 때만 전체 목록을 받음
  async function checkUpdate() {
    if (document.hidden) return;
    try {
      const r = await fetch("/data/meta.json", { cache: "no-cache" });
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
    const ids = state.all.filter((v) => inCountry(v) && inCat(v) && (!state.ch || v.channel === state.ch)).map((v) => v.id).sort().join();
    if (ids !== state.list.map((v) => v.id).sort().join() && scrollY < 400) { renderMenus(); apply(); }
  }

  async function load(initial) {
    // cache:"no-cache" → 서버(또는 CDN)에 "바뀌었나?"만 물어보고, 안 바뀌었으면 304로 본문 없이 재사용
    const res = await fetch("/data/videos.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(T("데이터를 불러오지 못했습니다"));
    const data = await res.json();
    const vids = parseIndex(data);
    state.latest = data.generatedAt;
    state.avatars = parseAvatars(data.avatars);
    $("#meta").textContent = data.generatedAt ? T("업데이트 {t}", { t: ago(data.generatedAt) }) : "";
    if (initial) {
      state.all = vids;
      renderMenus();
      apply();
      welcomeBack();
      return;
    }
    const known = new Set(state.all.map((v) => v.id));
    const fresh = vids.filter((v) => !known.has(v.id));
    if (fresh.length) {
      const t = $("#toast");
      t.textContent = T("새 영상 {n}개 ↑", { n: fresh.length });
      t.hidden = false;
      t.onclick = () => { t.hidden = true; state.all = vids; renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" }); };
    }
  }

  // 다시 온 방문자에게: "지난 방문 이후 새 영상 N개"
  function welcomeBack() {
    let last = 0;
    try { last = +localStorage.getItem("aic:last") || 0; localStorage.setItem("aic:last", String(Date.now())); } catch {}
    if (!last || Date.now() - last < 30 * 60e3) return;   // 30분 안에 다시 연 건 같은 방문으로
    since = last;
    const n = state.all.filter((v) => Date.parse(v.published) > last).length;
    if (!n || new URLSearchParams(location.search).get("v")) return;
    const t = $("#toast");
    t.textContent = T("지난 방문 이후 새 영상 {n}개 ›", { n });
    t.hidden = false; t.dataset.kind = "since";
    t.onclick = () => { t.hidden = true; state.backTo = null; state.ch = ""; state.cat = SINCE_KEY; renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" }); };
    setTimeout(() => { if (t.dataset.kind === "since") t.hidden = true; }, 12000);
  }
  function setFavBtn(on) {
    const b = $("#pFav");
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? T("♥ 찜함") : T("♡ 찜");
  }

  // ===== 메뉴 (1줄: 장르·국가, 2줄: 유튜브 채널) =====
  const inCat = (v, cat = state.cat) => cat === "전체" || (cat === NEW_KEY ? isNew(v.published) : cat === BINGE_KEY ? isBinge(v)
    : cat === FAV_KEY ? fav.has(v.id) : cat === HIST_KEY ? hist.includes(v.id) : cat === SINCE_KEY ? Date.parse(v.published) > since
    : v.categories.includes(cat));
  const newCount = () => countryPool().reduce((n, v) => n + (isNew(v.published) ? 1 : 0), 0);
  // 1줄 메뉴 항목 + 영상 개수 (NEW 탭과 같은 모양)
  const countLabel = (n) => (n > 999 ? "999+" : String(n));
  function catTab(c, n, label = nm(c), pressed = c === state.cat) {
    return `<button type="button" class="tab tab--count" data-key="${esc(c)}" aria-pressed="${pressed}" aria-label="${esc(T("{label} 영상 {n}개", { label, n }))}">` +
      `${esc(label)}<span class="tab__count" aria-hidden="true">${countLabel(n)}</span></button>`;
  }
  function newTab() {
    const n = newCount();
    return `<button type="button" class="tab tab--new" data-key="${NEW_KEY}" aria-pressed="${state.cat === NEW_KEY}" aria-label="${esc(T("NEW: 최근 3일 새 영상 {n}개", { n }))}">` +
      `<span class="tab__new" aria-hidden="true">NEW</span><span class="tab__count" aria-hidden="true">${countLabel(n)}</span></button>`;
  }
  // 국가 이름으로 보는 말 (관리자에서 만든 카테고리가 이 중 하나면 맨 위 국가 줄에 자동 표시)
  const COUNTRY_WORDS = new Set(["한국", "미국", "일본", "중국", "대만", "홍콩", "태국", "베트남", "인도네시아", "필리핀", "인도", "영국", "프랑스", "독일", "스페인", "이탈리아", "러시아", "캐나다", "호주", "브라질", "멕시코", "튀르키예", "터키", "아랍", "해외", "글로벌"]);
  function countryList() {
    const inData = new Set(state.all.flatMap((v) => v.categories));
    const extra = [...inData].filter((c) => COUNTRY_WORDS.has(c) && !state.site.countries.includes(c) && !state.site.genres.includes(c));
    return [...state.site.countries, ...extra];
  }
  function catList() {
    const countries = new Set(countryList());
    // 관리자 메뉴 순서 + 메뉴에 없지만 채널에 지정된 카테고리도 뒤에 자동 추가 (빠짐 없이)
    const inData = [...new Set(state.all.flatMap((v) => v.categories))].filter((c) => c && c !== "기타");
    const all = [...new Set([...state.site.menu, ...inData])];
    return all.filter((c) => !countries.has(c));
  }
  // 나라 필터 (빈 값 = 모든 국가)
  const inCountry = (v) => !state.country || v.categories.includes(state.country);
  const countryPool = () => state.all.filter(inCountry);
  function chip(cls, key, label, pressed, extra = "") {
    return `<button type="button" class="${cls}" data-key="${esc(key)}" aria-pressed="${pressed}">${extra}${esc(label)}</button>`;
  }
  function renderMenus() {
    // 전체 → NEW(최근 3일) → 관리자에서 정한 카테고리
    // 맨 위: 나라 줄 (개수는 전체 영상 기준)
    $("#countries").innerHTML = catTab("", state.all.length, T("모든 국가"), !state.country) +
      countryList().map((c) => catTab(c, state.all.reduce((n, v) => n + (v.categories.includes(c) ? 1 : 0), 0), nm(c), c === state.country)).join("");
    const pool = countryPool();   // 아래 줄들의 개수는 고른 나라 안에서
    const binge = pool.reduce((n, v) => n + (isBinge(v) ? 1 : 0), 0);
    $("#cats").innerHTML = catTab("전체", pool.length) + newTab() +
      (binge ? catTab(BINGE_KEY, binge, T("몰아보기")) : "") +
      catList().map((c) => [c, pool.reduce((n, v) => n + (v.categories.includes(c) ? 1 : 0), 0)])
        .filter(([c, n]) => n > 0 || c === state.cat)   // 아직 영상이 없는 카테고리는 숨김 (영상이 생기면 자동 표시)
        .map(([c, n]) => catTab(c, n)).join("");
    // 2줄: 현재 고른 장르·국가에 영상이 있는 채널만, 영상 많은 순
    const counts = new Map();
    for (const v of state.all) if (inCountry(v) && inCat(v) && v.channel) counts.set(v.channel, (counts.get(v.channel) || 0) + 1);
    const chs = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    if (state.ch && !counts.has(state.ch)) state.ch = "";
    $("#chs").innerHTML = chip("chtab", "", T("모든 채널"), !state.ch) +
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
    btn.setAttribute("aria-label", open ? T("채널 목록 접기") : T("채널 모두 펼치기"));
  }
  function setChOpen(open) {
    $("#chrow").classList.toggle("open", open);
    updateChMore();
    if (!open) $("#chs .chtab[aria-pressed=\"true\"]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function apply() {
    const q = state.q.trim().toLowerCase();
    let list = state.all.filter((v) => inCountry(v) && inCat(v) && (!state.ch || v.channel === state.ch) &&
      (!q || (v.title + " " + v.channel).toLowerCase().includes(q)));
    if (state.work) list = state.all.filter((v) => workKey(v) === state.work).sort(epSort);   // 작품: 1화부터 순서대로
    else list = state.sort === "views" ? list.sort((a, b) => b.views - a.views)
                                  : list.sort((a, b) => new Date(b.published) - new Date(a.published));
    state.list = list;
    state.shown = 0;
    $("#grid").innerHTML = "";
    const where = [state.country && nm(state.country), state.cat === NEW_KEY ? T("NEW · 최근 3일 새 영상") : state.cat === BINGE_KEY ? T("몰아보기 · 정주행") : SPECIAL[state.cat] ? T(SPECIAL[state.cat]) : (state.cat !== "전체" ? nm(state.cat) : ""), state.ch].filter(Boolean).join(" · ");
    const work = renderWorkHead();
    if (work) { $("#shelves").hidden = true; $("#shelves").innerHTML = ""; }
    const shelvesOn = !work && renderShelves();
    $("#backBtn").hidden = !state.backTo;
    $("#clearQ").hidden = !state.q;
    $("#listTitle").textContent = q ? T("\"{q}\" 검색 결과 {n}개", { q: state.q, n: list.length }) : work ? T("{name} 전체 회차", { name: work.name }) : (shelvesOn && where ? T("{where} 최신 영상", { where }) : where || T("최신 영상"));
    $("#sort").hidden = !!work;
    renderHero();
    const empty = $("#empty");
    empty.hidden = list.length > 0;
    syncListUrl();
    empty.textContent = !state.all.length ? T("아직 수집된 영상이 없습니다.")
      : state.country && !countryPool().length ? T("아직 {country} 채널이 없어요. 곧 추가될 예정이에요.", { country: nm(state.country) })
      : state.cat === FAV_KEY ? T("아직 찜한 영상이 없어요. 영상 화면에서 ♡ 찜을 누르면 여기에 모여요.")
      : state.cat === HIST_KEY ? T("아직 본 영상이 없어요.")
      : state.cat === NEW_KEY ? T("최근 3일 동안 새로 올라온 영상이 없어요.") : T("이 메뉴에는 아직 영상이 없어요.");
    more();
  }

  // ===== 채널별로 묶어 보기 (전체·장르 탭에서, 채널·검색을 고르지 않았을 때) =====
  const SHELF_MAX = 12;
  function shelfCard(v, key) {
    return card(v, -1).replace('class="card" href', `class="card card--shelf" data-shelf="${key}" data-id="${v.id}" href`);
  }
  function renderShelves() {
    const box = $("#shelves");
    state.shelves = new Map();
    const off = () => { box.hidden = true; box.innerHTML = ""; return false; };
    if (state.q || state.cat === NEW_KEY || state.cat === BINGE_KEY || SPECIAL[state.cat] || state.sort !== "new") return off();
    const pool = state.all.filter((v) => inCountry(v) && inCat(v)).sort((a, b) => new Date(b.published) - new Date(a.published));
    const groups = [];
    // 채널을 고른 화면: 그 채널의 작품들을 맨 위에
    if (state.ch) {
      const ws = worksOf(pool.filter((v) => v.channel === state.ch)).sort((a, b) => b.latest - a.latest);
      if (!ws.length) return off();
      groups.push({ key: "works:" + state.ch, title: T("{ch}의 작품", { ch: state.ch }), sub: T("작품을 누르면 1화부터 볼 수 있어요"), works: ws });
    } else {
      if (state.cat === "전체") {
        const watched = byIds(hist).filter(inCountry);
        if (watched.length) groups.push({ key: "hist", title: T("이어서 보기"), sub: T("최근 본 영상"), list: watched, go: { cat: HIST_KEY } });
        const liked = byIds([...fav].reverse()).filter(inCountry);
        if (liked.length) groups.push({ key: "fav", title: T("♥ 찜한 영상"), sub: T("내가 찜한"), list: liked, go: { cat: FAV_KEY } });
        const fresh = pool.filter((v) => isNew(v.published));
        if (fresh.length) groups.push({ key: "new", title: T("새로 올라온 영상"), sub: T("최근 3일"), list: fresh, go: { cat: NEW_KEY } });
      }
      // 작품별로 보기: 조회수 높은 작품 순 (장르 탭에서는 그 장르의 작품)
      const ws = worksOf(pool).sort((a, b) => b.views - a.views);
      if (ws.length >= 2) groups.push({ key: "works", title: T("인기 작품"), sub: T("작품별로 정주행"), works: ws });
      if (state.cat === "전체") {
        const binge = pool.filter(isBinge);
        if (binge.length) groups.push({ key: "binge", title: T("몰아보기 · 정주행"), sub: T("한 번에 이어 보기"), list: binge, go: { cat: BINGE_KEY } });
      }
      const byCh = new Map();
      for (const v of pool) { if (!byCh.has(v.channel)) byCh.set(v.channel, []); byCh.get(v.channel).push(v); }
      for (const [ch, list] of byCh) groups.push({ key: "ch:" + ch, title: ch, channel: ch, list, go: { ch } }); // 최근에 올린 채널 순
      if (groups.length < 2) return off();
    }
    let shelfStripN = 0;
    box.innerHTML = groups.map((g, gi) => {
      state.shelves.set(String(gi), g);
      const strip = gi + 1 < groups.length && gi + 1 >= STRIP_SHELF_FIRST && (gi + 1 - STRIP_SHELF_FIRST) % STRIP_SHELF_EVERY === 0 ? stripHtml("div", shelfStripN++) : "";
      // 채널 줄 제목 옆에 그 채널의 작품 바로가기 (작품이 2개 이상일 때)
      const chWorks = g.channel ? worksOf(g.list).sort((a, b) => b.latest - a.latest) : [];
      const chips = chWorks.length >= 2 ? `<div class="shelf__works">${chWorks.slice(0, 4).map((w) =>
        `<button type="button" class="wchip" data-work="${esc(w.key)}">${esc(w.name)} <span>${w.list.length}</span></button>`).join("")}</div>` : "";
      const n = g.works ? g.works.length : g.list.length;
      const head = g.channel
        ? `${avatarHtml(g.channel, "avatar shelf__av", g.list[0]?.cid)}<h3>${esc(g.title)}</h3><span class="shelf__n">${T("{n}편", { n })}</span>`
        : `<h3>${esc(g.title)}</h3><span class="shelf__n">${esc(g.sub)} · ${g.works ? T("{n}작품", { n }) : T("{n}편", { n })}</span>`;
      const more = g.go ? `<button class="shelf__more" type="button" data-go="${gi}">${T("전체 보기 ›")}</button>` : "";
      const body = g.works ? g.works.slice(0, 16).map(workCard).join("") : g.list.slice(0, SHELF_MAX).map((v) => shelfCard(v, gi)).join("");
      return `<section class="shelf${g.works ? " shelf--works" : ""}" aria-label="${esc(g.title)}">
        <div class="shelf__head">${head}
          <button class="shelf__nav" type="button" data-dir="-1" aria-label="${T("이전")}">‹</button>
          <button class="shelf__nav" type="button" data-dir="1" aria-label="${T("다음")}">›</button>
          ${more}</div>${chips}
        <div class="shelf__row">${body}</div></section>${strip}`;
    }).join("");
    shelfStripPos = shelfStripN;
    box.hidden = false;
    return true;
  }


  // "전체 보기"로 들어간 화면 → 원래 화면(메뉴·스크롤 위치)으로 돌아가기
  function restoreBack() {
    const b = state.backTo; if (!b) return;
    state.backTo = null;
    state.cat = b.cat; state.ch = b.ch; state.country = b.country || ""; state.work = "";
    renderMenus(); apply();
    requestAnimationFrame(() => scrollTo(0, b.y));
  }

  function renderHero() {
    const hero = $("#hero");
    const v = !state.q && !state.work && state.sort === "new" ? state.list[0] : null;
    // 작품 화면에서는 작품 정보가 맨 위 (대표 영상·광고 배너는 숨김)
    const promo = $("#promo");
    if (state.work) { if (!promo.hidden) promo.dataset.wasShown = "1"; promo.hidden = true; }
    else if (promo.dataset.wasShown) { promo.hidden = false; delete promo.dataset.wasShown; }
    if (!v) { hero.hidden = true; return; }
    hero.hidden = false;
    hero.innerHTML = `<img src="${thumb(v.id, "maxresdefault")}" alt="" />
      <div class="hero__body">
        <span class="hero__label">${isNew(v.published) ? "NEW · " : ""}${T("최신 업로드")}</span>
        <h2>${esc(v.title)}</h2>
        <p class="muted">${esc(v.channel)} · ${ago(v.published)}${v.views ? " · " + views(v.views) : ""}</p>
        <button class="hero__play" type="button">${T("▶ 지금 보기")}</button>
      </div>`;
    const img = hero.querySelector("img");
    img.addEventListener("error", () => { img.src = thumb(v.id); }, { once: true }); // 고화질 썸네일이 없을 때
    hero.onclick = () => { if (pageMode()) return goToVideo(state.list[0]); state.queue = state.list.slice(); openPlayer(0); };
  }

  // ===== 목록 사이 띠 배너 =====
  // 규칙: 메인 줄 사이 → 2번째 줄 다음, 그 뒤 5줄마다 / 영상 목록 → 애드센스 광고(36개마다)의 정확히 중간(18, 54, 90…)
  //       → 광고끼리 붙지 않고, 한 화면에 광고가 둘 이상 겹치지 않게
  const isOwnLink = (u) => { try { return new URL(u).origin === location.origin; } catch { return false; } };
  // 방문자가 국내인지 (IP 국가 → 없으면 한국 시간대·한국어로 짐작)
  function isKrVisitor() { const cc = I18N.country ? I18N.country() : ""; return cc ? cc === "KR" : I18N.lang === "ko"; }
  // 목록 위쪽 줄(선반)에 들어간 띠 배너 수 → 아래 영상 목록의 띠 배너는 그다음 자리부터 이어서 번호를 매김
  let shelfStripPos = 0;   // 선반에 배정된 띠 배너 자리 수 (빈 칸이라 안 보인 자리도 셈)
  function stripBase() { const sh = $("#shelves"); return sh && !sh.hidden ? shelfStripPos : 0; }
  // 띠 배너 자리 pos(0부터) → 칸 번호: 1번째 자리=1번, 2번째=2번 … 6번째=6번
  //  - '1번을 모든 자리에' 체크: 모든 자리 = 1번
  //  - 체크 풀림: 그 칸이 비었거나(이미지·링크 없음) 노출 대상이 아니면, 그리고 7번째 이후 자리는 → 2번 칸(기본 배너)
  const STRIP_DEFAULT = 1;
  function stripHtml(tag = "div", pos = 0) {
    const kr = isKrVisitor();
    const ok = (x) => x && (x.target === "all" || (x.target === "kr") === kr);
    const at = (slot) => (state.site.strips || []).find((x) => x.slot === slot);
    let b;
    if (state.site.stripsSame) b = at(0);
    else { b = pos < 6 ? at(pos) : null; if (!ok(b)) b = at(STRIP_DEFAULT); }
    if (!ok(b)) return "";
    const own = isOwnLink(b.link);
    return `<${tag} class="strip"><a class="strip__in" href="${esc(b.link)}"${own ? "" : ' target="_blank" rel="sponsored nofollow noopener noreferrer"'}${b.alt ? ` aria-label="${esc(b.alt)}"` : ""}>
      <img src="/${esc(b.image)}" alt="${esc(b.alt)}" width="1920" height="240" loading="lazy" decoding="async" />
      <span class="strip__ad">${T("광고")}</span></a>${b.note ? `<p class="strip__note">${esc(b.note)}</p>` : ""}</${tag}>`;
  }
  const STRIP_SHELF_FIRST = 2, STRIP_SHELF_EVERY = 5;

  // ===== 작품(시리즈) =====
  const worksOn = () => state.site.works !== false;   // 관리자 > 작품 탭의 스위치 (끄면 원래 화면)
  const workKey = (v) => (worksOn() && v && v.series ? v.channel + "\u0001" + v.series : "");
  const epSort = (a, b) => {
    const ea = epNum(a.title), eb = epNum(b.title);
    if (ea != null && eb != null && ea !== eb && isBinge(a) === isBinge(b)) return ea - eb;
    return new Date(a.published) - new Date(b.published);
  };
  // 작품 목록: [{key, name, channel, cid, list(1화부터), latest, views, cover}]
  function worksOf(pool) {
    const m = new Map();
    for (const v of pool) {
      const k = workKey(v); if (!k) continue;
      let w = m.get(k);
      if (!w) m.set(k, (w = { key: k, name: v.series, channel: v.channel, cid: v.cid, list: [], views: 0, latest: 0 }));
      w.list.push(v); w.views += v.views || 0; w.latest = Math.max(w.latest, Date.parse(v.published));
    }
    const out = [...m.values()].filter((w) => w.list.length >= 2);
    for (const w of out) {
      w.list.sort(epSort);
      const regular = w.list.filter((x) => !isBinge(x));
      w.cover = regular.length ? regular[regular.length - 1] : w.list[w.list.length - 1];   // 최신 회차 썸네일
      w.lastEp = [...regular].reverse().map((x) => epNum(x.title)).find((n) => n != null) ?? null;
    }
    return out;
  }
  // 작품 페이지 주소 (scripts/pages.mjs 의 slugify 와 같은 규칙, 이름이 겹치면 채널 이름을 붙임)
  const slugify = (s) => String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[\s_]+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "work";
  let slugMap = null, slugFor = null;
  function workSlug(w) {
    if (slugFor !== state.all) {
      slugFor = state.all; slugMap = new Map();
      const keys = [...new Set(state.all.filter((v) => v.series).map((v) => v.channel + "\u0001" + v.series))]
        .filter((k) => state.all.filter((v) => v.series && v.channel + "\u0001" + v.series === k).length >= 2).sort();
      const used = new Set();
      for (const k of keys) { const [ch, nm2] = k.split("\u0001"); let s = slugify(nm2); if (used.has(s)) s = `${s}-${slugify(ch)}`; used.add(s); slugMap.set(k, s); }
    }
    return slugMap.get(w.channel + "\u0001" + w.name) || slugify(w.name);
  }
  const workByKey = (k) => worksOf(state.all.filter((v) => workKey(v) === k))[0] || null;
  function workCard(w) {
    const fresh = isNew(new Date(w.latest).toISOString());
    return `<a class="wcard" href="${state.site.pages ? `/work/${encodeURIComponent(workSlug(w))}/` : `?w=${encodeURIComponent(w.name)}&ch=${encodeURIComponent(w.channel)}`}" data-work="${esc(w.key)}">
      <div class="wcard__img"><img loading="lazy" decoding="async" src="${thumb(w.cover.id, "mqdefault")}" width="320" height="180" alt="" />
        ${fresh ? `<span class="badge">${T("새 회차")}</span>` : ""}
        <span class="wcard__count">${w.lastEp ? T("EP.{n}까지", { n: w.lastEp }) + " · " : ""}${T("{n}편", { n: w.list.length })}</span></div>
      <div class="wcard__body"><b>${esc(w.name)}</b>
        <span>${avatarHtml(w.channel, "avatar wcard__av", w.cid)}${esc(w.channel)}${w.views ? ` · ${views(w.views)}` : ""}</span></div></a>`;
  }
  function renderWorkHead() {
    const box = $("#workHead");
    const w = state.work && workByKey(state.work);
    if (!w || state.q) { box.hidden = true; box.innerHTML = ""; return null; }
    box.innerHTML = `<div class="whead__bg" style="background-image:url('${thumb(w.cover.id, "hqdefault")}')"></div>
      <div class="whead__in">
        <img class="whead__poster" src="${thumb(w.cover.id, "mqdefault")}" alt="" width="320" height="180" />
        <div class="whead__txt">
          <span class="whead__eyebrow">${T("작품")}</span>
          <h2>${esc(w.name)}</h2>
          <p class="whead__ch">${avatarHtml(w.channel, "avatar", w.cid)}<span>${esc(w.channel)}</span></p>
          <p class="whead__meta">${T("총 {n}편", { n: w.list.length })}${w.lastEp ? " · " + T("EP.{n}까지", { n: w.lastEp }) : ""}${w.views ? ` · ${views(w.views)}` : ""} · ${T("최근 업데이트 {t}", { t: ago(new Date(w.latest).toISOString()) })}</p>
          <div class="whead__btns"><button type="button" class="btn btn--primary" data-play="first">${T("▶ 1화부터 보기")}</button>
            <button type="button" class="btn" data-play="last">${T("최신화 보기")}</button></div>
        </div></div>`;
    box.hidden = false;
    return w;
  }
  function openWork(key, { remember = true } = {}) {
    if (!key) return;
    if (remember && !state.work) {
      state.backTo = { cat: state.cat, ch: state.ch, country: state.country, y: scrollY };
      history.pushState({ list: 1, back: state.backTo }, "", location.href);
    }
    const w = workByKey(key);
    if (w) {
      track("page_view", { page_location: `${location.origin}/work/${encodeURIComponent(workSlug(w))}/`, page_title: `${w.name} | ${w.channel}` });
      track("work_open", { work: w.name, channel: w.channel });
    }
    state.work = key; state.q = ""; $("#q").value = "";
    if (w) state.ch = w.channel;
    renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" });
  }

  function card(v, i) {
    return `<a class="card" href="${state.site.pages ? `/watch/${v.id}/` : `?v=${v.id}`}" data-i="${i}">
      <div class="thumb">
        ${isNew(v.published) ? '<span class="badge">NEW</span>' : ""}
        ${v.short ? '<span class="badge badge--short">Shorts</span>' : ""}
        <img loading="lazy" decoding="async" src="${thumb(v.id, "mqdefault")}" width="320" height="180" alt="" />
      </div>
      <div class="card__body">
        ${avatarHtml(v.channel, "avatar", v.cid)}
        <div><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p>
        <p>${v.views ? views(v.views) + " · " : ""}${ago(v.published)}</p></div>
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
      // 띠 배너: 광고 간격의 중간 지점 (기본 18·54·90번째 뒤)
      if ((i + 1) % feedEvery() === Math.floor(feedEvery() / 2) && i + 1 < state.list.length) {
        const h = stripHtml("div", stripBase() + Math.floor(i / feedEvery())); if (h) { tmp.innerHTML = h; frag.appendChild(tmp.firstElementChild); }
      }
      if ((i + 1) % feedEvery() === 0 && i + 1 < state.list.length) {
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
      // 고른 언어로 유튜브 화면·자막 (한국어가 아니면 자막 켜기: 자막이 있는 영상에서 그 언어 자막 우선)
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, hl: I18N.meta.yt, cc_lang_pref: I18N.meta.yt, ...(I18N.lang !== "ko" ? { cc_load_policy: 1 } : {}) },
      events: {
        // 다음 영상 자동 재생은 플레이어가 열려 있을 때만 (닫은 뒤 다시 열리지 않게)
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED && $("#pAuto").checked && !$("#player").hidden) step(1); },
        onError: () => {
          if (!$("#pAuto").checked || $("#player").hidden) return;
          const cur = state.current;
          setTimeout(() => { if (!$("#player").hidden && state.current === cur) step(1); }, 1500);
        },
      },
    });
  }

  function openPlayer(i, { push = true } = {}) {
    const v = state.queue[i];
    if (!v) return;
    state.current = i;
    const p = $("#player");
    const wasOpen = !p.hidden;
    p.hidden = false;
    document.body.classList.add("locked");

    $("#pTitle").textContent = v.title;
    if (/^[\w-]{11}$/.test(v.id)) addHist(v.id);
    // 통계: 영상 재생 (검색용 영상 페이지와 같은 주소로 기록 → 관리자 통계의 인기 영상)
    if (VALID_ID.test(v.id)) {
      track("page_view", { page_location: `${location.origin}/watch/${v.id}/`, page_title: `${v.title} | ${v.channel}` });
      track("video_play", { video_id: v.id, video_title: v.title.slice(0, 90), channel: v.channel });
    }
    setFavBtn(fav.has(v.id));
    $("#pChannel").innerHTML = avatarHtml(v.channel, "avatar avatar--sm", v.cid) + `<span>${esc(v.channel)}</span>`;
    const w = v.series ? workByKey(workKey(v)) : null;
    const pw = $("#pWork");
    pw.hidden = !w;
    if (w) { pw.dataset.work = w.key; pw.innerHTML = `<span class="pwork__tag">${T("작품")}</span><b>${esc(w.name)}</b><span>${T("전체 {n}편 보기 ›", { n: w.list.length })}</span>`; }
    $("#pMeta").textContent = [v.views && views(v.views), ago(v.published)].filter(Boolean).join(" · ");
    // 원본 영상·채널 링크 (저작자 표시)
    $("#pYoutube").href = `https://www.youtube.com/watch?v=${v.id}`;
    const chLink = $("#pChannelLink");
    chLink.hidden = !v.cid;
    if (v.cid) chLink.href = `https://www.youtube.com/channel/${v.cid}`;
    $("#pDesc").textContent = v.description || "";
    $("#pDesc").hidden = !v.description;
    fitDesc();
    if (v.description === undefined) getDesc().then((d) => {
      v.description = typeof d[v.id] === "string" ? clean({ ...v, description: d[v.id] }).description : "";
      if (state.queue[state.current] === v) { $("#pDesc").textContent = v.description; $("#pDesc").hidden = !v.description; fitDesc(); }
    });
    // 다음·이전: 같은 시리즈(채널)의 다음 화·이전 화 우선, 없으면 다른 영상
    const plan = state.plan = buildUpNext(v, i);
    $("#pPrev").disabled = !plan.prev;
    $("#pNext").disabled = !plan.next;
    document.title = `${v.title} – ${siteName()}`;

    // 다음 영상 목록
    const item = (n, tag) =>
      `<li data-id="${n.id}"><img loading="lazy" src="${thumb(n.id, "mqdefault")}" alt="" />
       <div>${tag ? `<em class="upnext__tag">${tag}</em>` : ""}<b>${esc(n.title)}</b><span>${esc(n.channel)} · ${ago(n.published)}</span></div></li>`;
    const sec = (title, html) => html ? `<li class="upnext__h" aria-hidden="true">${title}</li>${html}` : "";
    $("#upnext").innerHTML =
      sec(T("다음 화"), plan.nextEps.map((n, k) => item(n, k === 0 ? T("다음 화") : "")).join("")) +
      sec(T("이전 화"), plan.prevEps.map((n, k) => item(n, k === 0 ? T("이전 화") : "")).join("")) +
      sec(plan.nextEps.length || plan.prevEps.length ? T("다른 영상") : "", plan.others.map((n) => item(n)).join(""));

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

  // 영상 설명: 길면 접어 두고 '더보기'로 펼치기 (설명 상자 안쪽 스크롤 없음)
  function fitDesc(open = false) {
    const d = $("#pDesc"), m = $("#pDescMore");
    d.classList.toggle("is-clamped", !open);
    m.textContent = T(open ? "접기" : "더보기");
    m.setAttribute("aria-expanded", String(open));
    if (open) return;
    requestAnimationFrame(() => {
      const over = !d.hidden && d.scrollHeight > d.clientHeight + 2;
      m.hidden = !over;
      if (!over) d.classList.remove("is-clamped");
    });
  }
  let closedAt = 0;   // 방금 닫았으면 뒤로가기 이벤트로 영상이 다시 열리지 않게
  function closePlayer({ fromPop = false } = {}) {
    const p = $("#player");
    if (p.hidden) return;
    p.hidden = true;
    closedAt = Date.now();
    document.body.classList.remove("locked");
    try { ytPlayer?.stopVideo(); } catch {}
    document.title = `${siteName()} | ${T("AI 영화·드라마 모아보기")}`;
    if (!fromPop && backToList) { backToList = false; history.back(); return; }
    if (!fromPop) history.state?.v ? history.back() : history.replaceState(null, "", location.pathname);
    const c = document.querySelector(`.card[data-i="${state.current}"]`);
    c?.focus({ preventScroll: true });
  }

  // ===== 공유하기 (카카오톡·인스타그램·X·페이스북·스레드·라인·왓츠앱·텔레그램·링크 복사) =====
  // 공유 주소는 검색용 영상 페이지(/watch/ID/) → 카카오톡 등 미리보기에 그 영상의 썸네일·제목이 나옴
  const shareUrlOf = (v) => state.site.pages ? `${location.origin}/watch/${v.id}/` : `${location.origin}${location.pathname}?v=${v.id}`;
  const SHARE_ICON = {
    kakao: '<svg viewBox="0 0 24 24"><path fill="#191919" d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 6l-1 3.6 4.1-2.7c.6.1 1.1.1 1.7.1 5 0 9-3.1 9-7s-4-7-9-7Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="#fff" stroke="none"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z"/></svg>',
    threads: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M16.6 11.1c-.1 0-.2-.1-.3-.1-.2-3-1.8-4.7-4.6-4.7-1.6 0-3 .7-3.8 2l1.5 1c.6-.9 1.6-1.1 2.3-1.1 1 0 1.7.3 2.1.9.3.4.5 1 .6 1.7-.8-.1-1.6-.2-2.5-.1-2.5.1-4.1 1.6-4 3.6.1 1 .6 1.9 1.4 2.4.7.5 1.6.7 2.5.6 1.2-.1 2.2-.5 2.8-1.4.5-.7.8-1.5.9-2.6.6.4 1 .8 1.3 1.4.5 1 .5 2.7-.9 4.1-1.2 1.2-2.7 1.8-4.9 1.8-2.5 0-4.3-.8-5.5-2.3C4.4 16.8 3.8 14.7 3.8 12s.6-4.8 1.7-6.3C6.7 4.2 8.5 3.4 11 3.4s4.4.8 5.6 2.3c.6.8 1.1 1.7 1.4 2.8l1.8-.5c-.4-1.4-1-2.6-1.8-3.6C16.5 2.5 14.1 1.5 11 1.5S5.5 2.5 4 4.5C2.6 6.3 1.9 8.8 1.9 12s.7 5.7 2.1 7.5c1.5 1.9 3.8 3 6.9 3 2.7 0 4.6-.7 6.2-2.3 2.1-2.1 2-4.6 1.3-6.2-.5-1.2-1.4-2.1-2.6-2.7Zm-4.3 4.9c-1 .1-2.1-.4-2.1-1.4 0-.7.5-1.6 2.3-1.7h.6c.6 0 1.2.1 1.8.2-.2 2.4-1.4 2.8-2.6 2.9Z"/></svg>',
    line: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 3.5c-5 0-9 3.2-9 7.2 0 3.6 3.2 6.6 7.5 7.1.3.1.7.2.8.5.1.2.1.6 0 .8l-.1.8c0 .2-.2.9.8.5 1-.4 5.4-3.2 7.4-5.5 1.4-1.5 2-3 2-4.6 0-3.9-4-7.1-9-7.1Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5Zm5.5 13.3c-.2.6-1.3 1.2-1.8 1.3-.5 0-1 .2-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.1 1.4 1.8.9.9 1.7 1.1 2 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.4.2.5.3.1.2.1.7-.1 1.3Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24"><path fill="#fff" d="m21.4 4.2-3.1 15c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2l-11 6.9-4.7-1.5c-1-.3-1-1 .2-1.5L20.1 3c.9-.3 1.6.2 1.3 1.2Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="#fff"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  };
  const SHARE_NAME = { kakao: "카카오톡", instagram: "인스타그램", x: "X", facebook: "Facebook", threads: "Threads", line: "LINE", whatsapp: "WhatsApp", telegram: "Telegram", copy: "링크 복사", more: "더보기" };
  // 언어(나라)마다 많이 쓰는 앱을 앞으로
  const SHARE_ORDER = {
    ko: ["kakao", "instagram", "x", "facebook", "threads", "line", "copy", "more"],
    ja: ["line", "x", "instagram", "facebook", "threads", "kakao", "copy", "more"],
    zh: ["whatsapp", "telegram", "x", "facebook", "instagram", "line", "copy", "more"],
    es: ["whatsapp", "instagram", "facebook", "x", "telegram", "threads", "copy", "more"],
    en: ["whatsapp", "x", "facebook", "instagram", "threads", "telegram", "copy", "more"],
  };
  let shareV = null, shareFrom = null;
  function openShare(v) {
    shareV = v; shareFrom = document.activeElement;
    const order = (SHARE_ORDER[I18N.lang] || SHARE_ORDER.en).filter((k) => k !== "more" || navigator.share);
    const box = $("#share");
    box.innerHTML = `<div class="share__head"><b id="shareTitle">${esc(T("공유하기"))}</b><button type="button" class="share__x" data-share="close" aria-label="${esc(T("닫기"))}">×</button></div>
      <div class="share__pv"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" width="120" height="68" /><div><b>${esc(v.title)}</b><span>${esc(v.channel)}</span></div></div>
      <div class="share__grid">${order.map((k) => `<button type="button" class="share__btn" data-share="${k}"><span class="share__ic share__ic--${k}">${SHARE_ICON[k]}</span><span>${esc(k === "x" || k === "facebook" || k === "threads" || k === "line" || k === "whatsapp" || k === "telegram" ? SHARE_NAME[k] : T(SHARE_NAME[k]))}</span></button>`).join("")}</div>
      <div class="share__url"><input type="text" readonly value="${esc(shareUrlOf(v))}" aria-label="URL" /><button type="button" class="btn" data-share="copy">${esc(T("링크 복사"))}</button></div>
      <p class="share__msg" role="status" aria-live="polite"></p>`;
    box.hidden = false; $("#shareBg").hidden = false;
    box.querySelector(".share__btn")?.focus();
  }
  function closeShare() {
    $("#share").hidden = true; $("#shareBg").hidden = true;
    try { shareFrom?.focus({ preventScroll: true }); } catch {}
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch { const i = $("#share input"); if (i) { i.select(); try { return document.execCommand("copy"); } catch {} } return false; }
  }
  const shareMsg = (m) => { const p = $("#share .share__msg"); if (p) { p.textContent = m; clearTimeout(shareMsg.t); shareMsg.t = setTimeout(() => (p.textContent = ""), 3500); } };
  // 카카오 JavaScript 키가 관리자에 있으면 카카오 SDK로 바로 공유 (없으면 기기 공유 창 / 링크 복사)
  let kakaoReady = null;
  function loadKakao() {
    const key = state.site.kakaoKey;
    if (!key) return Promise.resolve(false);
    if (kakaoReady) return kakaoReady;
    kakaoReady = new Promise((res) => {
      const s = document.createElement("script");
      s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"; s.crossOrigin = "anonymous";
      s.onload = () => { try { if (!window.Kakao.isInitialized()) window.Kakao.init(key); res(true); } catch { res(false); } };
      s.onerror = () => res(false);
      document.head.appendChild(s);
    });
    return kakaoReady;
  }
  async function doShare(k) {
    const v = shareV; if (!v) return;
    // 통계에서 어느 앱으로 공유된 링크로 들어왔는지 알 수 있게 UTM 꼬리표 (예: ?utm_source=kakao&utm_medium=share)
    const url = (() => { const u = new URL(shareUrlOf(v)); u.searchParams.set("utm_source", k === "more" ? "device_share" : k); u.searchParams.set("utm_medium", "share"); u.searchParams.set("utm_campaign", "video_share"); return u.href; })();
    const text = `${v.title} | All AI-Cinema`;
    const enc = encodeURIComponent;
    const open = (u) => window.open(u, "_blank", "noopener,noreferrer,width=620,height=640");
    track("share", { method: k, content_type: "video", item_id: v.id });
    if (k === "close") return closeShare();
    if (k === "copy") { shareMsg((await copyText(url)) ? T("링크 복사됨") : url); return; }
    if (k === "more") { try { await navigator.share({ title: v.title, text, url }); } catch {} return; }
    if (k === "x") return open(`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`);
    if (k === "facebook") return open(`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`);
    if (k === "threads") return open(`https://www.threads.net/intent/post?text=${enc(text + " " + url)}`);
    if (k === "line") return open(`https://social-plugins.line.me/lineit/share?url=${enc(url)}`);
    if (k === "whatsapp") return open(`https://wa.me/?text=${enc(text + " " + url)}`);
    if (k === "telegram") return open(`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`);
    if (k === "kakao") {
      if (await loadKakao()) { try { window.Kakao.Share.sendScrap({ requestUrl: url }); return; } catch {} }
      if (navigator.share && env.mobile) { try { await navigator.share({ title: v.title, text, url }); } catch {} return; }
      await copyText(url); shareMsg(T("링크를 복사했어요. 카카오톡 대화창에 붙여 넣어 주세요.")); return;
    }
    if (k === "instagram") {   // 인스타그램은 웹 공유 주소가 없어서: 휴대폰은 기기 공유 창(인스타 선택), PC는 링크 복사
      if (navigator.share && env.mobile) { try { await navigator.share({ title: v.title, text, url }); } catch {} return; }
      await copyText(url); shareMsg(T("링크를 복사했어요. 인스타그램 DM이나 스토리에 붙여 넣어 주세요.")); return;
    }
  }
  function bindShare() {
    $("#shareBg").addEventListener("click", closeShare);
    $("#share").addEventListener("click", (e) => { const b = e.target.closest("[data-share]"); if (b) doShare(b.dataset.share); });
    $("#share").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeShare(); } });
  }

  // ===== 즐겨찾기 · 홈 화면에 추가 (앱처럼 설치) =====
  // 브라우저 정책상 사이트가 즐겨찾기를 직접 추가할 수는 없어서, 기기마다 가장 쉬운 방법을 안내하고
  // 크롬·엣지·삼성 인터넷에서는 "앱 설치" 창을 바로 띄움.
  let installEvt = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; showInstallCard(); });
  addEventListener("appinstalled", () => { installEvt = null; closeInstall(); hideInstallCard(true); });
  const ua = navigator.userAgent;
  const env = {
    standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
    ios: /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    inApp: /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua),
    mac: /Mac/i.test(navigator.platform || ua),
    mobile: matchMedia("(max-width:760px)").matches || /Android|iPhone|iPad/i.test(ua),
  };
  function installHtml() {
    const how = [];
    if (installEvt) how.push(`<button type="button" class="btn btn--primary install__go" data-act="install">${env.mobile ? T("홈 화면에 추가하기") : T("앱으로 설치하기")}</button>`);
    if (env.inApp) how.push(`<li>${T("install.inapp")}</li>`);
    else if (env.ios) how.push(`<li>${T("install.ios", { icon: '<span class="install__ico" aria-hidden="true">⎋</span>' })}</li>`);
    else if (env.mobile) how.push(installEvt ? "" : `<li>${T("install.android")}</li>`);
    if (!env.mobile) how.push(`<li>${T("install.pc", { keys: `<kbd>${env.mac ? "⌘ Cmd" : "Ctrl"}</kbd> + <kbd>D</kbd>` })}</li>`);
    const btn = how.find((h) => h.startsWith("<button")) || "";
    const steps = how.filter((h) => h && !h.startsWith("<button")).join("");
    return `<div class="install__head"><img src="/assets/logo.svg?v=2" alt="" width="44" height="44" />
        <div><b>${T("All AI-Cinema 바로가기")}</b><span>${T("새 AI 영화·드라마가 매일 올라와요. 바로가기를 만들어 두고 편하게 다시 보세요.")}</span></div>
        <button type="button" class="install__x" data-act="close" aria-label="${T("닫기")}">×</button></div>
      ${btn}${steps ? `<ol class="install__steps">${steps}</ol>` : ""}
      <p class="install__note">${T("찜한 영상과 최근 본 영상은 이 기기에만 저장돼요.")}</p>`;
  }
  function openInstall() {
    const box = $("#install");
    box.innerHTML = installHtml();
    box.hidden = false; $("#installBg").hidden = false;
    $("#saveBtn").setAttribute("aria-expanded", "true");
    box.querySelector(".install__go, .install__x")?.focus();
  }
  function closeInstall() {
    $("#install").hidden = true; $("#installBg").hidden = true;
    $("#saveBtn").setAttribute("aria-expanded", "false");
  }
  async function runInstall() {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch {}
    installEvt = null; closeInstall(); hideInstallCard(true);
  }
  // 메인 위쪽 안내 카드: 두 번째 방문부터, 닫으면 2주 동안 안 보임
  function showInstallCard() {
    if (env.standalone) return;
    let visits = 0, hideUntil = 0;
    try { visits = +localStorage.getItem("aic:visits") || 0; hideUntil = +localStorage.getItem("aic:installHide") || 0; } catch {}
    if (visits < 2 || Date.now() < hideUntil || !(installEvt || env.ios)) return;
    $("#installCard").hidden = false;
  }
  function hideInstallCard(forever) {
    $("#installCard").hidden = true;
    try { localStorage.setItem("aic:installHide", String(Date.now() + (forever ? 365 : 14) * 864e5)); } catch {}
  }
  function bindInstall() {
    try { localStorage.setItem("aic:visits", String((+localStorage.getItem("aic:visits") || 0) + 1)); } catch {}
    // 이미 앱(홈 화면)으로 연 경우: 설치 안내 대신 '찜한 영상' 목록을 열어 줌 (버튼은 숨기지 않음)
    $("#saveBtn").addEventListener("click", () => {
      if (env.standalone) {
        state.backTo = { cat: state.cat, ch: state.ch, country: state.country, y: scrollY, label: T("♥ 찜한 영상") };
        state.cat = FAV_KEY; state.ch = "";
        history.pushState({ list: 1, back: state.backTo }, "", location.href);
        renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      $("#install").hidden ? openInstall() : closeInstall();
    });
    $("#installBg").addEventListener("click", closeInstall);
    $("#install").addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]")?.dataset.act;
      if (a === "close") closeInstall(); else if (a === "install") runInstall();
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#install").hidden) closeInstall(); });
    $("#installCard").addEventListener("click", (e) => {
      if (e.target.closest(".icard__x")) return hideInstallCard(false);
      if (installEvt) runInstall(); else openInstall();
    });
    showInstallCard();
    // 홈 화면 앱으로 쓸 수 있게 서비스워커 등록 (페이지를 저장해 두지 않음 → 항상 최신 화면)
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // ===== 언어 선택 (한국어 · English · 日本語 · 中文) =====
  function bindLang() {
    const btn = $("#langBtn"), menu = $("#langMenu");
    const paint = () => {
      $("#langCur").textContent = I18N.meta.short;
      menu.innerHTML = I18N.LANGS.map((l) => `<li role="option" tabindex="-1" data-lang="${l.code}" aria-selected="${l.code === I18N.lang}" lang="${l.html}">${esc(l.label)}</li>`).join("");
    };
    const home = menu.parentElement, dim = document.createElement("div");
    dim.className = "lang-dim"; dim.hidden = true; document.body.appendChild(dim);
    const open = (on) => {
      const sheet = on && matchMedia("(max-width:760px)").matches;   // 모바일: 가운데 창으로
      if (sheet) { menu.dataset.title = T("언어"); document.body.appendChild(menu); }
      else if (menu.parentElement !== home) home.appendChild(menu);
      menu.classList.toggle("lang-menu--sheet", sheet);
      dim.hidden = !sheet;
      menu.hidden = !on; btn.setAttribute("aria-expanded", String(on));
      if (on) menu.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    };
    dim.addEventListener("click", () => open(false));
    btn.addEventListener("click", (e) => { e.stopPropagation(); open(menu.hidden); });
    menu.addEventListener("click", (e) => { const li = e.target.closest("[data-lang]"); if (li) { choose(li.dataset.lang); open(false); btn.focus(); } });
    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll("li")], i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); document.activeElement?.click(); }
      else if (e.key === "Escape") { open(false); btn.focus(); }
    });
    document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".lang, #langMenu")) open(false); });
    let lastW = innerWidth;   // 화면 폭이 바뀔 때만 닫음 (모바일 주소창 높이 변화는 무시)
    addEventListener("resize", () => { if (innerWidth !== lastW) { lastW = innerWidth; if (!menu.hidden) open(false); } });
    function choose(code, persist = true) {
      if (!I18N.setLang(code, persist)) return;
      paint();
      // 주소의 ?lang= 은 지움 (고른 언어는 이 브라우저에 기억)
      const tl = $("#toolsLink"); if (tl) tl.href = code === "ko" ? "/tools/" : `/${code}/tools/`;   // 하단 'AI 제작 도구' 링크도 그 언어로
      // 주소: ?lang= 은 지우고, 언어별 페이지(/, /en/, /ja/, /zh/, /es/)에 있으면 고른 언어 주소로 바꿈
      const u = new URL(location.href); u.searchParams.delete("lang");
      if (/^\/((en|ja|zh|es)\/?)?(index\.html)?$/.test(u.pathname)) u.pathname = code === "ko" ? "/" : `/${code}/`;
      if (u.href !== location.href) history.replaceState(history.state, "", u.pathname + u.search);
      document.title = $("#player").hidden ? `${siteName()} | ${T("AI 영화·드라마 모아보기")}` : document.title;
      renderPromo(); renderMenus(); apply();
      if (search.open) renderSearch();
      if (!$("#player").hidden) { const v = state.queue[state.current]; if (v) { setFavBtn(fav.has(v.id)); $("#pMeta").textContent = [v.views && views(v.views), ago(v.published)].filter(Boolean).join(" · "); } }
    }
    paint();
    { const tl = $("#toolsLink"); if (tl) tl.href = I18N.lang === "ko" ? "/tools/" : `/${I18N.lang}/tools/`; }
    if (I18N.onGeo) I18N.onGeo((code) => choose(code, false));   // 접속 국가(IP)로 정한 언어 적용
  }

  // ===== 검색 패널 =====
  // PC: 검색창 아래로 펼쳐지는 패널 / 모바일: 전체 화면 검색 (뒤로가기로 닫힘)
  // 입력 전: 최근 검색어 · 인기 영상 TOP 5(조회수) · 인기 채널 · 장르 바로가기
  // 입력 중: 채널 · 영상 미리보기(조회수 순) · "전체 결과 보기"
  const search = { open: false, mobile: false, sel: -1, items: [], shown: [], topCat: "전체" };
  const mqMobile = matchMedia("(max-width:760px)");
  const RECENT_KEY = "aic:recent";
  const getRecent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, 8) : []; } catch { return []; } };
  const setRecent = (a) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 8))); } catch {} };
  const addRecent = (q) => { q = q.trim().slice(0, 40); if (q) setRecent([q, ...getRecent().filter((x) => x !== q)]); };
  const sInput = () => (search.mobile ? $("#spq") : $("#q"));
  // 검색어 부분 강조 (텍스트는 모두 이스케이프)
  function hl(text, q) {
    text = String(text || "");
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }
  const byViews = (a, b) => (b.views || 0) - (a.views || 0);
  // TOP 5 탭: 영상이 5개 이상 있는 국가·장르만
  function topTabs() {
    const has = (k) => state.all.reduce((n, v) => n + (v.views > 0 && inCat(v, k) ? 1 : 0), 0) >= 5;
    return [["전체", T("전체")], [NEW_KEY, "NEW"], ...countryList().map((c) => [c, nm(c)]), ...catList().map((c) => [c, nm(c)])]
      .filter(([k], i) => i === 0 || has(k));
  }
  function topHtml(vid) {
    search.shown = state.all.filter((v) => v.views > 0 && inCat(v, search.topCat)).sort(byViews).slice(0, 5);
    return search.shown.map((v, k) => vid(v, k, k + 1)).join("") || `<p class="sp-empty">${T("아직 영상이 없어요.")}</p>`;
  }
  let spVid = null;
  function renderSearch() {
    const q = sInput().value.trim();
    const sec = (title, body, extra = "") => body ? `<section class="sp__sec"><div class="sp__h"><h4>${title}</h4>${extra}</div>${body}</section>` : "";
    const vid = (v, k, rank) => `<button type="button" class="sp-item sp-vid" data-act="play" data-k="${k}">
        ${rank ? `<span class="sp-rank${rank <= 3 ? " sp-rank--top" : ""}">${rank}</span>` : ""}
        <img src="${thumb(v.id, "mqdefault")}" alt="" loading="lazy" />
        <span class="sp-t"><b>${hl(v.title, q)}</b><small>${esc(v.channel)}${v.views ? " · " + views(v.views) : ""}</small></span></button>`;
    spVid = vid;
    let html = "";
    if (!q) {
      const recent = getRecent();
      html += sec(T("최근 검색어"), recent.length ? `<div class="sp-chips">${recent.map((r) =>
        `<span class="sp-chip"><button type="button" class="sp-item" data-act="q" data-q="${esc(r)}">${esc(r)}</button><button type="button" class="sp-x" data-act="delrecent" data-q="${esc(r)}" aria-label="${esc(T("{q} 삭제", { q: r }))}">×</button></span>`).join("")}</div>` : "",
        `<button type="button" class="sp-link" data-act="clearrecent">${T("전체 삭제")}</button>`);
      // 인기 영상 TOP 5: 위의 탭(전체·NEW·국가·장르)으로 순위를 바꿔 볼 수 있음
      const tabs = topTabs();
      if (!tabs.some(([k]) => k === search.topCat)) search.topCat = "전체";
      html += `<section class="sp__sec"><div class="sp__h"><h4>${T("인기 영상 TOP 5")}</h4><span class="sp-sub">${T("조회수 기준")}</span></div>
        <div class="sp-tabs" role="tablist" aria-label="${esc(T("인기 영상 TOP 5"))}">${tabs.map(([k, label]) =>
          `<button type="button" class="sp-tab${k === search.topCat ? " is-on" : ""}" role="tab" aria-selected="${k === search.topCat}" data-act="topcat" data-key="${esc(k)}">${esc(label)}</button>`).join("")}</div>
        <div id="spTop">${topHtml(vid)}</div></section>`;
      const chViews = new Map();
      for (const v of state.all) if (v.channel) chViews.set(v.channel, (chViews.get(v.channel) || 0) + (v.views || 0));
      const topCh = [...chViews].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
      const topWorks = worksOf(state.all).sort((a, b) => b.views - a.views).slice(0, 8);
      html += sec(T("인기 작품"), topWorks.length ? `<div class="sp-chips">${topWorks.map((w) =>
        `<button type="button" class="sp-item sp-chip" data-act="work" data-key="${esc(w.key)}">${esc(w.name)}</button>`).join("")}</div>` : "");
      html += sec(T("인기 채널"), `<div class="sp-chips">${topCh.map((c) =>
        `<button type="button" class="sp-item sp-chip sp-chip--ch" data-act="ch" data-key="${esc(c)}">${avatarHtml(c)}<span>${esc(c)}</span></button>`).join("")}</div>`);
      html += sec(T("장르로 찾기"), `<div class="sp-chips">${[[BINGE_KEY, T("몰아보기")], ...catList().map((c) => [c, nm(c)])]
        .filter(([k]) => state.all.some((v) => inCat(v, k)))
        .map(([k, label]) => `<button type="button" class="sp-item sp-chip" data-act="cat" data-key="${esc(k)}">${esc(label)}</button>`).join("")}</div>`);
    } else {
      const ql = q.toLowerCase();
      const chs = [...new Set(state.all.map((v) => v.channel))].filter((c) => c && c.toLowerCase().includes(ql)).slice(0, 4);
      const hits = state.all.filter((v) => (v.title + " " + v.channel).toLowerCase().includes(ql));
      search.shown = hits.slice().sort(byViews).slice(0, 8);
      const ws = worksOf(state.all).filter((w) => w.name.toLowerCase().includes(ql)).sort((a, b) => b.views - a.views).slice(0, 4);
      html += sec(T("작품"), ws.map((w) => `<button type="button" class="sp-item sp-vid" data-act="work" data-key="${esc(w.key)}">
        <img src="${thumb(w.cover.id, "mqdefault")}" alt="" loading="lazy" />
        <span class="sp-t"><b>${hl(w.name, q)}</b><small>${esc(w.channel)} · ${T("전체 {n}편", { n: w.list.length })}</small></span></button>`).join(""));
      html += sec(T("채널"), chs.map((c) => `<button type="button" class="sp-item sp-row" data-act="ch" data-key="${esc(c)}">${avatarHtml(c, "avatar")}<span class="sp-t"><b>${hl(c, q)}</b><small>${T("채널 영상 {n}편", { n: state.all.filter((v) => v.channel === c).length })}</small></span></button>`).join(""));
      html += sec(T("영상"), search.shown.map((v, k) => vid(v, k)).join(""));
      html += hits.length
        ? `<button type="button" class="sp-item sp-all" data-act="submit">${esc(T("\"{q}\" 검색 결과 {n}개 모두 보기 ›", { q, n: hits.length }))}</button>`
        : `<p class="sp-empty">${esc(T("\"{q}\"에 맞는 영상이 없어요. 다른 단어로 찾아보세요.", { q }))}</p>`;
    }
    $("#spBody").innerHTML = html;
    search.items = [...$("#spBody").querySelectorAll(".sp-item")];
    search.sel = -1;
    $("#spClear").hidden = !$("#spq").value;
  }
  function placeSearch() {   // PC: 검색창 바로 아래에 맞춤
    if (search.mobile) return;
    const r = $(".search").getBoundingClientRect(), sp = $("#sp");
    sp.style.top = Math.round(r.bottom + 8) + "px";
    sp.style.left = Math.round(r.left) + "px";
    sp.style.width = Math.round(Math.max(r.width, 380)) + "px";
  }
  function openSearch() {
    if (search.open) return;
    search.open = true;
    search.mobile = mqMobile.matches;
    const sp = $("#sp");
    sp.classList.toggle("sp--sheet", search.mobile);
    sp.removeAttribute("style");
    sp.hidden = false;
    $("#searchBtn").setAttribute("aria-expanded", "true");
    if (search.mobile) {
      $("#spq").value = state.q;
      document.body.classList.add("locked");
      history.pushState({ ...(history.state || {}), search: 1 }, "", location.href);   // 휴대폰 뒤로가기로 닫기
      setTimeout(() => $("#spq").focus(), 30);
    } else placeSearch();
    renderSearch();
  }
  function closeSearch({ fromPop = false } = {}) {
    if (!search.open) return;
    search.open = false;
    $("#sp").hidden = true;
    $("#searchBtn").setAttribute("aria-expanded", "false");
    if (search.mobile) {
      if ($("#player").hidden) document.body.classList.remove("locked");
      if (!fromPop && history.state?.search) history.back();
    }
  }
  function runSearch(q) {
    q = String(q || "").trim();
    addRecent(q);
    if (q) track("search", { search_term: q.slice(0, 80) });
    state.backTo = null; state.work = ""; state.q = q;
    $("#q").value = q; $("#spq").value = q;
    closeSearch();
    $("#q").blur();
    apply();
    scrollTo({ top: 0, behavior: "smooth" });
  }
  function searchAct(el) {
    const act = el.dataset.act, q = sInput().value.trim();
    if (act === "q") return runSearch(el.dataset.q);
    if (act === "topcat") {   // 순위 목록만 바꿈 (패널은 그대로, 탭도 그대로 남겨 둠)
      search.topCat = el.dataset.key;
      for (const b of $("#spBody").querySelectorAll(".sp-tab")) { const on = b === el; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", String(on)); }
      $("#spTop").innerHTML = topHtml(spVid);
      search.items = [...$("#spBody").querySelectorAll(".sp-item")]; search.sel = -1;
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (!search.mobile) sInput().focus();
      return;
    }
    if (act === "submit") return runSearch(q);
    if (act === "delrecent") { setRecent(getRecent().filter((x) => x !== el.dataset.q)); renderSearch(); sInput().focus(); return; }
    if (act === "clearrecent") { setRecent([]); renderSearch(); sInput().focus(); return; }
    if (act === "play") {
      const list = search.shown.slice(), k = +el.dataset.k;
      if (q) addRecent(q);
      closeSearch();
      if (pageMode()) return goToVideo(list[k]);
      state.queue = list; openPlayer(k);
      return;
    }
    if (act === "work") { if (q) addRecent(q); closeSearch(); openWork(el.dataset.key); return; }
    if (act === "cat" || act === "ch") {
      if (q) addRecent(q);
      state.backTo = null; state.work = ""; state.q = ""; $("#q").value = "";
      if (act === "cat") { state.cat = el.dataset.key; state.ch = ""; } else { state.cat = "전체"; state.ch = el.dataset.key; }
      closeSearch(); renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function bindSearch() {
    const qi = $("#q"), mi = $("#spq");
    $(".search").addEventListener("submit", (e) => { e.preventDefault(); runSearch(qi.value); });
    $("#spForm").addEventListener("submit", (e) => { e.preventDefault(); runSearch(mi.value); });
    qi.addEventListener("focus", () => { if (!mqMobile.matches) openSearch(); });
    qi.addEventListener("click", () => { if (!mqMobile.matches) openSearch(); });
    let t;
    const typed = () => { clearTimeout(t); t = setTimeout(() => { if (!search.open) openSearch(); else renderSearch(); }, 120); };
    qi.addEventListener("input", () => { typed(); if (!qi.value && state.q) { state.q = ""; apply(); } });
    mi.addEventListener("input", typed);
    $("#searchBtn").addEventListener("click", () => (search.open ? closeSearch() : openSearch()));
    $("#spBack").addEventListener("click", () => closeSearch());
    $("#spClear").addEventListener("click", () => { mi.value = ""; renderSearch(); mi.focus(); });
    $("#sp").addEventListener("mousedown", (e) => { if (!search.mobile) e.preventDefault(); });   // PC: 패널 클릭해도 검색창 포커스 유지
    $("#sp").addEventListener("click", (e) => { const el = e.target.closest("[data-act]"); if (el) searchAct(el); });
    $("#sp").addEventListener("wheel", (e) => {   // PC: TOP 5 탭 줄은 마우스 휠로 옆으로 넘김
      const row = e.target.closest(".sp-tabs");
      if (!row || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
      e.preventDefault(); row.scrollLeft += e.deltaY;
    }, { passive: false });
    document.addEventListener("click", (e) => {
      if (search.open && !search.mobile && !e.target.closest("#sp, .search")) closeSearch();
    });
    // 키보드: ↑↓로 고르고 Enter, Esc로 닫기
    const keys = (e) => {
      if (!search.open) return;
      if (e.key === "Escape") { e.preventDefault(); closeSearch(); sInput().blur(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      if (e.key === "Enter") { if (search.sel >= 0 && search.items[search.sel]) { e.preventDefault(); searchAct(search.items[search.sel]); } return; }
      e.preventDefault();
      const n = search.items.length; if (!n) return;
      search.sel = (search.sel + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      search.items.forEach((el, k) => el.classList.toggle("is-sel", k === search.sel));
      search.items[search.sel].scrollIntoView({ block: "nearest" });
    };
    qi.addEventListener("keydown", keys); mi.addEventListener("keydown", keys);
    addEventListener("resize", () => { if (search.open && !search.mobile) placeSearch(); }, { passive: true });
    addEventListener("scroll", () => { if (search.open && !search.mobile) placeSearch(); }, { passive: true });
    $("#clearQ").addEventListener("click", () => { state.q = ""; qi.value = ""; mi.value = ""; apply(); });
  }

  // ===== 다음 영상 순서 정하기 =====
  // 같은 채널 영상을 올린 순서(화수 표기가 있으면 화수)대로 줄 세워서 지금 영상의 바로 다음 화·이전 화를 찾음.
  // 몰아보기·통합본은 회차 순서에서 빼고(지금 보는 게 몰아보기면 포함), 남는 자리는 지금 보던 목록의 다른 영상으로 채움.
  const EP_RE = /(?:\bep\.?|episode|에피소드)\s*0*(\d{1,3})|(?:^|[^\d])0*(\d{1,3})\s*(?:화|회차|편)(?![가-힣]*\s*몰아)/i;
  const epNum = (t) => { const m = String(t).match(EP_RE); return m ? +(m[1] || m[2]) : null; };
  function buildUpNext(v, i) {
    const binge = isBinge(v);
    // 같은 작품(없으면 같은 채널)의 회차 순서
    const same = (x) => x.channel === v.channel && (!worksOn() || !v.series || x.series === v.series);
    const seq = state.all.filter((x) => same(x) && (x.id === v.id || isBinge(x) === binge))
      .sort((a, b) => {
        const ea = epNum(a.title), eb = epNum(b.title);
        if (ea != null && eb != null && ea !== eb) return ea - eb;
        return new Date(a.published) - new Date(b.published);
      });
    const k = seq.findIndex((x) => x.id === v.id);
    let nextEps = k < 0 ? [] : seq.slice(k + 1, k + 11);
    // 몰아보기 "(7-10화)" 다음에는 일반 회차 11화부터 이어서
    const range = binge && String(v.title).match(/0*(\d{1,3})\s*[-~～]\s*0*(\d{1,3})\s*(?:화|회|편)?/);
    if (range) {
      const end = +range[2];
      const after = state.all.filter((x) => same(x) && !isBinge(x) && epNum(x.title) > end)
        .sort((a, b) => epNum(a.title) - epNum(b.title));
      nextEps = [...after, ...nextEps].slice(0, 10);
    }
    const prevEps = k < 0 ? [] : seq.slice(Math.max(0, k - 5), k).reverse();
    const used = new Set([v.id, ...nextEps.map((x) => x.id), ...prevEps.map((x) => x.id)]);
    // 남는 자리: 같은 채널의 다른 영상(최신순) → 보던 목록의 다음 영상 → 사이트 전체 최신 영상
    const byNew = (a, b) => new Date(b.published) - new Date(a.published);
    const others = [];
    for (const x of [...state.all.filter(same).sort(byNew), ...state.all.filter((x) => x.channel === v.channel).sort(byNew),
                     ...state.queue.slice(i + 1), ...state.queue.slice(0, i),
                     ...state.all.slice().sort(byNew)]) {
      if (others.length >= 15) break;
      if (x && !used.has(x.id)) { used.add(x.id); others.push(x); }
    }
    return { nextEps, prevEps, others, next: nextEps[0] || others[0] || null, prev: prevEps[0] || state.queue[i - 1] || null };
  }
  function openVideo(v) {
    if (!v) return;
    let i = state.queue.findIndex((x) => x.id === v.id);
    if (i < 0) { state.queue.push(v); i = state.queue.length - 1; }
    openPlayer(i, { push: false });
  }
  const step = (d) => openVideo(d > 0 ? state.plan?.next : state.plan?.prev);

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
    // 통계: 배너·띠 배너 클릭
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a.promo__item, a.strip__in");
      if (a) track(a.classList.contains("strip__in") ? "strip_click" : "banner_click", { link_url: a.href.slice(0, 200) });
    }, true);
    $("#shelves").addEventListener("click", (e) => {
      const wk = e.target.closest("[data-work]");
      if (wk && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); openWork(wk.dataset.work); return; }
      const nav = e.target.closest(".shelf__nav");
      if (nav) { const row = nav.closest(".shelf").querySelector(".shelf__row"); row.scrollBy({ left: +nav.dataset.dir * row.clientWidth * 0.9, behavior: "smooth" }); return; }
      const go = e.target.closest(".shelf__more");
      if (go) {
        const g = state.shelves.get(go.dataset.go); if (!g) return;
        // 돌아올 화면(지금 메뉴·스크롤 위치) 기억 + 브라우저/휴대폰 뒤로가기로도 돌아오게 기록
        state.backTo = { cat: state.cat, ch: state.ch, country: state.country, y: scrollY, label: g.title };
        if (g.go.cat) state.cat = g.go.cat;
        if (g.go.ch) state.ch = g.go.ch;
        history.pushState({ list: 1, back: state.backTo }, "", location.href);
        renderMenus(); apply(); scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const c = e.target.closest(".card--shelf");
      if (!c || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      const g = state.shelves.get(c.dataset.shelf); if (!g) return;
      const i = g.list.findIndex((v) => v.id === c.dataset.id); if (i < 0) return;
      if (pageMode()) {   // 채널 선반에서 고르면 그 채널 영상으로 다음 화가 이어지게
        return goToVideo(g.list[i], { ch: g.go.ch || "" });
      }
      state.queue = g.list.slice();
      openPlayer(i);
    });
    $("#workHead").addEventListener("click", (e) => {
      const b = e.target.closest("[data-play]"); if (!b || !state.list.length) return;
      const i = b.dataset.play === "first" ? 0 : state.list.length - 1;
      if (pageMode()) return goToVideo(state.list[i], { ch: state.ch });
      state.queue = state.list.slice(); openPlayer(i);
    });
    $("#grid").addEventListener("click", (e) => {
      const c = e.target.closest(".card");
      if (!c || e.metaKey || e.ctrlKey || e.shiftKey) return; // 새 탭 열기는 허용
      e.preventDefault();
      if (pageMode()) return goToVideo(state.list[+c.dataset.i]);
      state.queue = state.list.slice();
      openPlayer(+c.dataset.i);
    });
    const pick = (row, t) => {
      row.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === t)));
      t.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    };
    $("#countries").addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      state.backTo = null; state.work = ""; state.country = t.dataset.key || "";
      renderMenus();
      apply();
    });
    $("#cats").addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      state.backTo = null; state.work = ""; state.cat = t.dataset.key;
      pick($("#cats"), t);
      renderMenus();
      apply();
    });
    // 프로필 사진을 못 불러오면 사진만 지우고 첫 글자를 보여줌 (인라인 onerror는 보안 정책상 사용 안 함)
    document.addEventListener("error", (e) => { if (e.target.tagName === "IMG" && e.target.parentElement?.matches(".avatar, .chtab__av")) e.target.remove(); }, true);
    $("#chs").addEventListener("click", (e) => {
      const t = e.target.closest(".chtab");
      if (!t) return;
      state.backTo = null; state.work = ""; state.ch = t.dataset.key;
      pick($("#chs"), t);
      if ($("#chrow").classList.contains("open")) setChOpen(false);   // 고르면 다시 접기
      apply();
    });
    bindSearch();
    bindInstall();
    bindShare();
    bindLang();
    $("#chMore").addEventListener("click", () => setChOpen(!$("#chrow").classList.contains("open")));
    let rt;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(updateChMore, 150); }, { passive: true });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });

    // 닫기(✕) 버튼으로만 닫힘 (바깥 어두운 영역을 눌러도 닫히지 않음)
    $("#player").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closePlayer(); });
    $("#pDescMore").onclick = () => fitDesc($("#pDesc").classList.contains("is-clamped"));
    $("#upnext").addEventListener("click", (e) => {
      const li = e.target.closest("li[data-id]"); if (!li) return;
      openVideo(state.all.find((x) => x.id === li.dataset.id) || state.queue.find((x) => x.id === li.dataset.id));
    });
    $("#pPrev").onclick = () => step(-1);
    $("#pNext").onclick = () => step(1);
    $("#pWork").onclick = () => {
      const k = $("#pWork").dataset.work; if (!k) return;
      closePlayer({ fromPop: true });
      history.replaceState(null, "", location.pathname);
      openWork(k);
    };
    $("#pFav").onclick = () => {
      const v = state.queue[state.current]; if (!v) return;
      setFavBtn(toggleFav(v.id));
      if (state.cat === "전체" || state.cat === FAV_KEY) apply();   // 메인의 찜 목록도 바로 갱신
    };
    $("#pShare").onclick = () => { const v = state.queue[state.current]; if (v) openShare(v); };
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
      if (search.open && !history.state?.search) { closeSearch({ fromPop: true }); return; }
      const id = new URLSearchParams(location.search).get("v");
      if (id && VALID_ID.test(id)) {
        // 닫기(✕) 직후 이전 기록이 영상 주소면 다시 열지 않고 홈 화면으로
        if (Date.now() - closedAt < 1500) { history.replaceState(null, "", location.pathname); return; }
        return openById(id, false);
      }
      if (!$("#player").hidden) closePlayer({ fromPop: true });
      if (state.backTo && !history.state?.list) restoreBack();   // "전체 보기" 전 화면으로
    });
    $("#backBtn").addEventListener("click", () => {
      if (history.state?.list) history.back(); else restoreBack();
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
    if (state.country) q.set("n", state.country);
    if (state.work) q.set("w", state.work.split("\u0001")[1] || "");
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
    if (location.pathname + location.search !== want) history.replaceState(history.state, "", want);
  }
  function goToVideo(v, { ch = "" } = {}) {
    if (!v || !VALID_ID.test(v.id)) return;
    syncListUrl();
    // 돌아왔을 때 보던 위치로 스크롤하기 위해 저장 (이 브라우저 탭에만, 실패해도 무시)
    try { sessionStorage.setItem("aic:list", JSON.stringify({ at: location.search, y: scrollY, shown: state.shown })); } catch {}
    const q = listQuery(); q.set("v", v.id);
    if (ch) q.set("ch", ch);   // 채널 묶음에서 열면 다음 영상이 같은 채널로 이어지게
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
    if ($("#player").hidden || !state.queue.some((v) => v.id === id)) state.queue = state.list.slice();
    let i = state.queue.findIndex((v) => v.id === id);
    if (i < 0) { // 목록에 없는 영상(공유 링크 등)도 재생
      const v = state.all.find((x) => x.id === id) || { id, title: "", channel: "", cid: "", categories: [], published: new Date().toISOString() };
      state.queue.unshift(v); i = 0;
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

  // 고른 언어로 정적 문구 바꾸기 (헤더·버튼·플레이어 등)
  I18N.applyStatic();
  if (I18N.lang !== "ko") document.title = `${SITE_NAME_DEFAULT} | ${T("AI 영화·드라마 모아보기")}`;
  bind();
  loadSite().then(() => {
    renderAds();
    renderPromo();
    return load(true);
  }).then(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("v");
    // 보던 카테고리·채널·정렬 이어서 보기 (영상 페이지 ↔ 목록 오갈 때)
    const c = params.get("c"), ch = params.get("ch"), so = params.get("s"), na = params.get("n");
    if (na && countryList().includes(na)) state.country = na;
    if (c && (c === NEW_KEY || c === BINGE_KEY || (SPECIAL[c] && c !== SINCE_KEY) || catList().includes(c))) state.cat = c;
    if (ch && state.all.some((v) => v.channel === ch)) state.ch = ch;
    if (so === "views") { state.sort = "views"; $("#sort").value = "views"; }
    urlReady = true;
    // 영상 페이지에 다녀와서 목록을 새로 불러온 경우에도 "돌아가기" 유지
    const hb = history.state?.list && history.state.back;
    if (hb && typeof hb === "object") state.backTo = { cat: String(hb.cat || "전체"), ch: String(hb.ch || ""), country: countryList().includes(hb.country) ? hb.country : "", y: +hb.y || 0 };
    const wn = (params.get("w") || "").slice(0, 40);
    if (wn && state.ch) { const k = state.ch + "\u0001" + wn; if (state.all.some((v) => workKey(v) === k)) state.work = k; }
    if (c || ch || so || na || wn || state.backTo) { renderMenus(); apply(); }
    // 검색 주소 (?q=검색어) – 구글 검색결과의 사이트 내 검색창에서 들어올 때
    const sq = (params.get("q") || "").trim().slice(0, 40);
    if (sq && !id) { state.q = sq; $("#q").value = sq; $("#spq").value = sq; apply(); }
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

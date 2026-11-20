/* AI Screen Archive – 프런트엔드 */
(() => {
  "use strict";

  // ===== 설정 =====
  const ADSENSE = {
    client: "ca-pub-8096684162493748", // 본인 게시자 ID
    feedSlot: "3333333333",            // 목록 사이 인피드 광고 슬롯
    playerSlot: "4444444444",          // 플레이어 아래 광고 슬롯
    feedEvery: 12,                     // 카드 N개마다 광고 1개
  };
  const PAGE_SIZE = 24;
  const REFRESH_MS = 10 * 60 * 1000;  // 열려 있는 페이지에서 10분마다 새 영상 확인
  const NEW_HOURS = 48;               // NEW 배지 기준

  // ===== 상태 =====
  const $ = (s) => document.querySelector(s);
  const state = { all: [], list: [], shown: 0, cat: "전체", q: "", sort: "new", current: -1, latest: null };
  let ytApi, ytPlayer;

  // ===== 유틸 =====
  // ── 보안: 외부(유튜브)에서 온 문자열은 항상 이 함수로 이스케이프한 뒤에만 HTML에 넣습니다
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VALID_ID = /^[\w-]{11}$/;                        // 유튜브 영상 ID 형식만 허용
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
  const pushAd = (el) => {
    if (!AD_OK || !el) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { el.remove(); }
  };
  const AD_OK = /^ca-pub-\d{16}$/.test(ADSENSE.client);   // 게시자 ID를 넣기 전에는 광고 요청 안 함
  const adIns = (slot, cls) => {
    const box = document.createElement("div");
    box.className = "ad " + cls;
    if (!AD_OK || !/^\d{6,12}$/.test(slot)) return box;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    Object.assign(ins.dataset, { adClient: ADSENSE.client, adSlot: slot, adFormat: "auto", fullWidthResponsive: "true" });
    box.appendChild(ins);
    return box;
  };

  // ===== 데이터 =====
  // 압축 형식(v2)과 예전 형식 모두 읽기
  // ── 보안: 데이터 파일 내용도 믿지 않고 형식·길이를 검사해서 정상 항목만 사용
  const str = (x, max) => (typeof x === "string" ? x : "").replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, max);
  function clean(v) {
    if (!v || !VALID_ID.test(v.id)) return null;
    const t = Date.parse(v.published);
    return {
      id: v.id,
      title: str(v.title, 200) || "(제목 없음)",
      channel: str(v.channel, 80),
      category: str(v.category, 30) || "기타",
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
          id: r[0], title: r[1], channel: data.channels?.[r[2]], category: data.cats?.[r[3]],
          published: new Date(Number(r[4]) * 1000).toISOString(), views: r[5], short: r[6] === 1,
        } : null) : [];
    const seen = new Set();
    return raw.slice(0, 5000).map(clean).filter((v) => v && !seen.has(v.id) && seen.add(v.id));
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
  }

  async function load(initial) {
    // cache:"no-cache" → 서버(또는 CDN)에 "바뀌었나?"만 물어보고, 안 바뀌었으면 304로 본문 없이 재사용
    const res = await fetch("data/videos.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("데이터를 불러오지 못했습니다");
    const data = await res.json();
    const vids = parseIndex(data);
    if (initial) {
      state.all = vids;
      state.latest = data.generatedAt;
      renderTabs();
      apply();
      $("#meta").textContent = data.generatedAt ? `업데이트 ${ago(data.generatedAt)}` : "";
    } else {
      state.latest = data.generatedAt;
      const known = new Set(state.all.map((v) => v.id));
      const fresh = vids.filter((v) => !known.has(v.id));
      if (fresh.length) {
        const t = $("#toast");
        t.textContent = `새 영상 ${fresh.length}개 ↑`;
        t.hidden = false;
        t.onclick = () => { t.hidden = true; state.all = vids; renderTabs(); apply(); scrollTo({ top: 0, behavior: "smooth" }); };
      }
      $("#meta").textContent = data.generatedAt ? `업데이트 ${ago(data.generatedAt)}` : "";
    }
  }

  // ===== 탭 / 필터 =====
  function renderTabs() {
    const cats = ["전체", ...new Set(state.all.map((v) => v.category).filter(Boolean))];
    const channels = [...new Set(state.all.map((v) => v.channel).filter(Boolean))];
    const items = [...cats.map((c) => ({ key: c, label: c })), ...(channels.length > 1 ? channels.map((c) => ({ key: "ch:" + c, label: "📺 " + c })) : [])];
    $("#tabs").innerHTML = items.map((t) =>
      `<button class="tab" data-cat="${esc(t.key)}" aria-pressed="${t.key === state.cat}">${esc(t.label)}</button>`).join("");
  }

  function apply() {
    const q = state.q.trim().toLowerCase();
    let list = state.all.filter((v) => {
      if (state.cat.startsWith("ch:")) { if (v.channel !== state.cat.slice(3)) return false; }
      else if (state.cat !== "전체" && v.category !== state.cat) return false;
      return !q || (v.title + " " + v.channel).toLowerCase().includes(q);
    });
    list = state.sort === "views" ? list.sort((a, b) => b.views - a.views)
                                  : list.sort((a, b) => new Date(b.published) - new Date(a.published));
    state.list = list;
    state.shown = 0;
    $("#grid").innerHTML = "";
    $("#listTitle").textContent = q ? `"${state.q}" 검색 결과 ${list.length}개` : state.cat === "전체" ? "최신 영상" : state.cat.replace(/^ch:/, "");
    renderHero();
    const empty = $("#empty");
    empty.hidden = list.length > 0;
    empty.textContent = state.all.length ? "조건에 맞는 영상이 없습니다." : "아직 수집된 영상이 없습니다. channels.json 을 설정한 뒤 업데이트를 실행하세요.";
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
    hero.onclick = () => openPlayer(0);
  }

  function card(v, i) {
    return `<a class="card" href="?v=${v.id}" data-i="${i}">
      <div class="thumb">
        ${isNew(v.published) ? '<span class="badge">NEW</span>' : ""}
        ${v.short ? '<span class="badge badge--short">Shorts</span>' : ""}
        <img loading="lazy" decoding="async" src="${thumb(v.id, "mqdefault")}" width="320" height="180" alt="" />
      </div>
      <div class="card__body">
        <span class="avatar" aria-hidden="true">${esc((v.channel || "?").trim()[0] || "?")}</span>
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
    for (let i = start; i < end; i++) {
      tmp.innerHTML = card(state.list[i], i);
      frag.appendChild(tmp.firstElementChild);
      if (AD_OK && (i + 1) % ADSENSE.feedEvery === 0 && i + 1 < state.list.length) frag.appendChild(adIns(ADSENSE.feedSlot, "ad--feed"));
    }
    const newAds = [...frag.querySelectorAll(".adsbygoogle")];
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
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
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
    $("#pChannel").textContent = v.channel;
    $("#pMeta").textContent = [v.views && "조회수 " + fmtViews(v.views), ago(v.published)].filter(Boolean).join(" · ");
    $("#pDesc").textContent = v.description || "";
    $("#pDesc").hidden = !v.description;
    if (v.description === undefined) getDesc().then((d) => {
      v.description = typeof d[v.id] === "string" ? clean({ ...v, description: d[v.id] }).description : "";
      if (state.list[state.current] === v) { $("#pDesc").textContent = v.description; $("#pDesc").hidden = !v.description; }
    });
    $("#pPrev").disabled = i === 0;
    $("#pNext").disabled = i >= state.list.length - 1;
    document.title = `${v.title} – AI Screen Archive`;

    // 다음 영상 목록
    const next = state.list.slice(i + 1, i + 21);
    $("#upnext").innerHTML = next.map((n, k) =>
      `<li data-i="${i + 1 + k}"><img loading="lazy" src="${thumb(n.id, "mqdefault")}" alt="" />
       <div><b>${esc(n.title)}</b><span>${esc(n.channel)} · ${ago(n.published)}</span></div></li>`).join("");

    // 플레이어 아래 광고 (영상 위를 가리지 않도록 정보 영역 아래에 배치)
    const adBox = $("#playerAd");
    if (adBox) adBox.textContent = "";
    const ins = adIns(ADSENSE.playerSlot, "").firstElementChild;
    if (ins && adBox) { adBox.appendChild(ins); pushAd(ins); }

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
    document.title = "AI Screen Archive – AI 영화·드라마·단편 모아보기";
    if (!fromPop) history.state?.v ? history.back() : history.replaceState(null, "", location.pathname);
    const c = document.querySelector(`.card[data-i="${state.current}"]`);
    c?.focus({ preventScroll: true });
  }

  const step = (d) => {
    const i = state.current + d;
    if (i >= 0 && i < state.list.length) openPlayer(i, { push: false });
  };

  // ===== 이벤트 =====
  function bind() {
    $("#grid").addEventListener("click", (e) => {
      const c = e.target.closest(".card");
      if (!c || e.metaKey || e.ctrlKey || e.shiftKey) return; // 새 탭 열기는 허용
      e.preventDefault();
      openPlayer(+c.dataset.i);
    });
    $("#tabs").addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      state.cat = t.dataset.cat;
      document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", b === t));
      t.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      apply();
    });
    $(".search").addEventListener("submit", (e) => e.preventDefault());
    let qt;
    $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; apply(); }, 200); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; apply(); });

    $("#player").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closePlayer(); });
    $("#upnext").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) openPlayer(+li.dataset.i, { push: false }); });
    $("#pPrev").onclick = () => step(-1);
    $("#pNext").onclick = () => step(1);
    $("#pShare").onclick = async () => {
      const v = state.list[state.current];
      const url = location.origin + location.pathname + "?v=" + v.id;
      try { navigator.share ? await navigator.share({ title: v.title, url }) : (await navigator.clipboard.writeText(url), alert("링크를 복사했습니다")); } catch {}
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
  }

  function openById(id, push) {
    if (!VALID_ID.test(id)) return;
    let i = state.list.findIndex((v) => v.id === id);
    if (i < 0) { // 목록에 없는 영상(공유 링크 등)도 재생
      const v = state.all.find((x) => x.id === id) || { id, title: "", channel: "", published: new Date().toISOString() };
      state.list.unshift(v); i = 0;
    }
    openPlayer(i, { push });
  }

  // ── 보안: 다른 사이트가 이 페이지를 iframe에 넣어 클릭을 유도(클릭재킹)하지 못하게 차단
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch { document.documentElement.hidden = true; return; }
  }

  // index.html 에 직접 넣은 상단/하단 광고 활성화
  if (AD_OK) document.querySelectorAll("ins.adsbygoogle").forEach(pushAd);
  else document.querySelectorAll(".ad--top, .ad--bottom").forEach((el) => el.remove());

  // 로딩 중 스켈레톤
  $("#grid").innerHTML = Array.from({ length: 8 }, () =>
    '<div class="card skeleton"><div class="thumb"></div><div class="line" style="width:90%"></div><div class="line" style="width:55%"></div></div>').join("");

  bind();
  load(true).then(() => {
    const id = new URLSearchParams(location.search).get("v");
    if (id && /^[\w-]{11}$/.test(id)) {
      history.replaceState(null, "", location.pathname);
      openById(id, true);
    }
  }).catch((err) => {
    $("#grid").innerHTML = "";
    const e = $("#empty"); e.hidden = false; e.textContent = err.message;
  });
})();

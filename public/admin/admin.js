/* AI Screen Archive – 관리자 페이지
 *
 * 동작 방식
 *  - 이 사이트는 서버 프로그램이 없는 정적 사이트라, 관리자 기능은 GitHub 저장소의 channels.json 을
 *    GitHub API 로 직접 고치는 방식입니다. (숨기기 = exclude 목록에 추가)
 *  - 저장하면 GitHub Actions 가 영상 목록을 다시 만들고 Cloudways 에 배포 → 1~2분 뒤 사이트에서 사라짐.
 *  - 숨긴 영상은 채널에 새로 올라와도 수집 단계에서 걸러져 다시 나타나지 않습니다.
 *
 * 보안
 *  - 로그인 = GitHub 토큰(이 저장소 Contents 읽기/쓰기만 허용된 fine-grained 토큰 권장).
 *  - 토큰은 이 브라우저에만 저장(sessionStorage, "로그인 유지" 시 localStorage)되고 api.github.com 에만 보냅니다.
 *  - 화면에 넣는 모든 글자는 textContent 로만 넣어 스크립트로 실행되지 않습니다.
 *  - CSP 로 이 폴더의 스크립트와 api.github.com 연결만 허용합니다.
 */
(() => {
  "use strict";

  const API = "https://api.github.com";
  const FILE = "channels.json";
  const BRANCH = "main";
  const KEY = "asa-admin";
  const PAGE = 60;
  const VALID_ID = /^[\w-]{11}$/;
  const REPO_RE = /^[A-Za-z0-9_.-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;

  // 다른 사이트가 이 페이지를 iframe 에 넣지 못하게
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  const $ = (s) => document.querySelector(s);
  const state = {
    auth: null,          // { repo, token }
    user: "",
    config: null,        // channels.json 내용
    data: null,          // 사이트의 영상 목록
    videos: [],
    pending: new Set(),  // 방금 숨겨서 사이트 반영을 기다리는 영상
    ch: "",              // 채널 필터
    q: "",
    shown: 0,
    selected: new Set(),
    busy: false,
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
    save(v, remember) {
      try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(v)); } catch {}
    },
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
    if (e.status === 404) return "저장소나 channels.json 을 찾을 수 없어요. 저장소 이름과 토큰의 저장소 권한을 확인해 주세요.";
    if (e.status === 409 || e.status === 422) return "다른 변경과 겹쳤어요. 잠시 후 다시 시도해 주세요.";
    if (e.name === "TypeError") return "GitHub 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
    return "오류: " + clean(e.message, 150);
  };

  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const repoPath = () => `/repos/${state.auth.repo}`;

  async function readConfig() {
    const f = await gh(`${repoPath()}/contents/${FILE}?ref=${BRANCH}`);
    const cfg = JSON.parse(b64decode(f.content));
    for (const k of ["channels", "videos", "exclude"]) if (!Array.isArray(cfg[k])) cfg[k] = [];
    return { cfg, sha: f.sha };
  }

  // 변경 함수(mutate)를 최신 channels.json 에 적용해 저장. 겹치면 최신본을 다시 받아 최대 3번 재시도.
  async function saveConfig(message, mutate) {
    for (let attempt = 1; ; attempt++) {
      const { cfg, sha } = await readConfig();
      const changed = mutate(cfg);
      if (changed === false) { state.config = cfg; return false; }
      try {
        await gh(`${repoPath()}/contents/${FILE}`, {
          method: "PUT",
          body: JSON.stringify({ message: `관리자: ${message}`, branch: BRANCH, sha, content: b64encode(JSON.stringify(cfg, null, 2) + "\n") }),
        });
        state.config = cfg;
        return true;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt < 3) continue;
        throw e;
      }
    }
  }

  // ───────── 유튜브 링크 해석 (추가 폼용) ─────────
  function parseLink(s) {
    s = String(s || "").trim();
    if (!s || s.length > 300) return null;
    if (/^@[\p{L}\p{N}._-]{3,100}$/u.test(s)) return { type: "channel", url: "https://www.youtube.com/" + s };
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    const p = u.pathname.split("/").filter(Boolean);
    if (host === "youtu.be" && VALID_ID.test(p[0] || "")) return { type: "video", id: p[0] };
    if (host !== "youtube.com") return null;
    const v = u.searchParams.get("v");
    if (p[0] === "watch" && VALID_ID.test(v || "")) return { type: "video", id: v };
    if (["shorts", "live", "embed"].includes(p[0]) && VALID_ID.test(p[1] || "")) return { type: "video", id: p[1], short: p[0] === "shorts" };
    if (p[0] === "channel" && /^UC[\w-]{22}$/.test(p[1] || "")) return { type: "channel", url: `https://www.youtube.com/channel/${p[1]}`, id: p[1] };
    if (p[0]?.startsWith("@") || ["c", "user"].includes(p[0])) {
      const path = p[0].startsWith("@") ? p[0] : `${p[0]}/${p[1] || ""}`;
      if (/^[@\p{L}\p{N}._%/-]{2,120}$/u.test(path)) return { type: "channel", url: `https://www.youtube.com/${path}` };
    }
    return null;
  }
  const idOf = (x) => {
    if (typeof x === "string") return VALID_ID.test(x) ? x : parseLink(x)?.id || null;
    return x?.id && VALID_ID.test(x.id) ? x.id : parseLink(x?.url)?.id || null;
  };

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
      category: clean(d.cats?.[x[3]], 30),
      published: Number(x[4]) * 1000,
      views: Number(x[5]) || 0,
      manual: x[8] === 1,
    }));
    // 사이트에서 이미 사라진 영상은 대기 표시 해제
    const live = new Set(state.videos.map((v) => v.id));
    for (const id of state.pending) if (!live.has(id)) state.pending.delete(id);
  }

  // ───────── 화면 그리기 ─────────
  function renderStatus() {
    const s = $("#status");
    s.textContent = "";
    const gen = state.data?.generatedAt ? Date.parse(state.data.generatedAt) : NaN;
    s.append(...[
      el("span", {}, "저장소 ", el("b", { text: state.auth.repo })),
      el("span", {}, "사이트 영상 ", el("b", { text: `${state.videos.length}개` })),
      el("span", {}, "마지막 수집 ", el("b", { text: Number.isFinite(gen) ? ago(gen) : "아직 없음" })),
      state.pending.size ? el("span", {}, "사이트 반영 대기 ", el("b", { text: `${state.pending.size}개` })) : null,
      el("button", { class: "btn", type: "button", onclick: refresh, text: "새로고침" }),
    ].filter(Boolean));
    $("#hiddenCount").textContent = state.config?.exclude.length ? `(${state.config.exclude.length})` : "";
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
        el("div", { class: "meta", text: [v.channel, v.category, ago(v.published), fmtViews(v.views), v.manual ? "직접 추가" : ""].filter(Boolean).join(" · ") }),
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
    const all = $("#selectAll");
    all.checked = visible.length > 0 && visible.every((v) => state.selected.has(v.id));
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

  function renderChannels() {
    const list = $("#channelList");
    list.textContent = "";
    const chs = state.config?.channels || [];
    const cats = new Set([...chs.map((c) => clean(c.category, 30)), ...state.videos.map((v) => v.category)].filter(Boolean));
    const dl = $("#catList");
    dl.textContent = "";
    for (const c of cats) dl.append(el("option", { value: c }));
    if (!chs.length) { list.append(el("li", { class: "adm-empty", text: "등록된 채널이 없어요. 위에서 추가해 주세요." })); return; }
    chs.forEach((c, i) => {
      const name = clean(c.name, 80) || clean(c.url || c.handle || c.id, 100);
      const del = el("button", { class: "btn", type: "button", text: "삭제" });
      del.addEventListener("click", () => {
        if (del.dataset.armed) return removeChannel(c, name);
        del.dataset.armed = "1";
        del.textContent = "정말 삭제할까요?";
        del.classList.add("btn--danger");
        setTimeout(() => { delete del.dataset.armed; del.textContent = "삭제"; del.classList.remove("btn--danger"); }, 4000);
      });
      list.append(el("li", { class: "adm-item no-thumb", dataset: { i } },
        el("div", {},
          el("b", { text: name }),
          el("div", { class: "meta", text: [clean(c.category, 30), clean(c.url || (c.id ? `channel/${c.id}` : c.handle), 120)].filter(Boolean).join(" · ") }),
        ),
        del,
      ));
    });
  }

  function renderAll() {
    renderStatus();
    renderChannelFilter();
    renderVideos();
    renderHidden();
    renderChannels();
  }

  // ───────── 작업 ─────────
  async function run(label, fn) {
    if (state.busy) return;
    state.busy = true;
    document.body.style.cursor = "progress";
    updateBulk();
    try { await fn(); }
    catch (e) { toast(explain(e), true); if (e.status === 401) logout(); }
    finally { state.busy = false; document.body.style.cursor = ""; updateBulk(); }
  }

  function hide(ids) {
    const targets = state.videos.filter((v) => ids.includes(v.id) && !state.pending.has(v.id));
    if (!targets.length) return;
    run("hide", async () => {
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
      toast(ok ? `${targets.length}개 영상을 숨겼어요. 1~2분 뒤 사이트에서 사라져요.` : "이미 숨긴 영상이에요.");
    });
  }

  function restore(x) {
    const id = idOf(x);
    run("restore", async () => {
      await saveConfig("영상 복원", (cfg) => {
        const before = cfg.exclude.length;
        cfg.exclude = cfg.exclude.filter((y) => (id ? idOf(y) !== id : JSON.stringify(y) !== JSON.stringify(x)));
        return cfg.exclude.length !== before;
      });
      if (id) state.pending.delete(id);
      renderStatus(); renderHidden();
      toast("복원했어요. 다음 수집 때 다시 보여요. (채널의 최근 영상 15개 안에 있거나 직접 추가한 영상이어야 해요)");
    });
  }

  function removeChannel(c, name) {
    run("removeChannel", async () => {
      const key = JSON.stringify(c);
      await saveConfig(`채널 삭제: ${name}`, (cfg) => {
        const before = cfg.channels.length;
        cfg.channels = cfg.channels.filter((y) => JSON.stringify(y) !== key);
        return cfg.channels.length !== before;
      });
      renderChannels();
      toast(`'${name}' 채널을 삭제했어요. 1~2분 뒤 이 채널 영상이 사이트에서 빠져요.`);
    });
  }

  function addLinks(e) {
    e.preventDefault();
    const lines = $("#addLinks").value.split(/[\s,]+/).filter(Boolean).slice(0, 30);
    const category = clean($("#addCat").value, 30) || "기타";
    const name = clean($("#addName").value, 80);
    const refs = lines.map((l) => ({ l, r: parseLink(l) }));
    const bad = refs.filter((x) => !x.r);
    if (!lines.length) return toast("유튜브 링크를 넣어 주세요.", true);
    if (bad.length) return toast(`유튜브 링크가 아니에요: ${clean(bad[0].l, 60)}`, true);
    run("add", async () => {
      let added = 0;
      await saveConfig(`채널·영상 ${refs.length}개 추가`, (cfg) => {
        for (const { r } of refs) {
          if (r.type === "channel") {
            if (cfg.channels.some((c) => (c.url && c.url.toLowerCase() === r.url.toLowerCase()) || (r.id && c.id === r.id))) continue;
            cfg.channels.push({ url: r.url, ...(name ? { name } : {}), category });
          } else {
            cfg.exclude = cfg.exclude.filter((y) => idOf(y) !== r.id);
            if (cfg.videos.some((y) => idOf(y) === r.id)) continue;
            cfg.videos.push({ url: `https://www.youtube.com/${r.short ? "shorts/" : "watch?v="}${r.id}`, category, ...(name ? { name } : {}) });
          }
          added++;
        }
        return added > 0;
      });
      $("#addLinks").value = "";
      renderChannels(); renderHidden(); renderStatus();
      toast(added ? `${added}개를 추가했어요. 1~2분 뒤 사이트에 나타나요.` : "이미 등록된 링크예요.");
    });
  }

  async function refresh() {
    await run("refresh", async () => {
      const [{ cfg }] = await Promise.all([readConfig(), loadData()]);
      state.config = cfg;
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
    const [user, { cfg }] = await Promise.all([gh("/user"), readConfig()]);
    state.user = clean(user?.login, 40);
    state.config = cfg;
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
    if (!REPO_RE.test(repo)) return showLogin("저장소는 '아이디/저장소이름' 형식으로 넣어 주세요. 예: myname/AllAI-Cinema");
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
    for (const p of ["videos", "hidden", "channels"]) $(`#tab-${p}`).hidden = p !== t.dataset.tab;
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
  $("#addForm").addEventListener("submit", addLinks);

  // 시작
  const saved = store.load();
  if (saved) {
    $("#repo").value = saved.repo;
    enter(saved).catch((err) => { if (err.status === 401) store.clear(); showLogin(explain(err)); });
  } else {
    showLogin();
  }
})();

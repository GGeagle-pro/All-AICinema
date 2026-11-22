// 유튜브 채널 RSS + 직접 추가한 영상을 모아 public/data/ 에 저장합니다.
// API 키가 필요 없습니다. (채널당 최신 15개를 RSS로 제공 → 주기적으로 실행하면 계속 누적)
// 실행: node scripts/fetch-videos.mjs
//
// channels.json
//   channels : 계속 자동 수집할 채널  { "url"|"handle"|"id": …, "name"?, "categories": ["AI 드라마","한국"] }
//   videos   : 하나씩 직접 추가한 영상 { "url": …, "categories": [...], "name"? }
//   (예전 형식 "category": "AI 영화" 도 그대로 읽습니다)
//   exclude  : 사이트에서 숨길 영상 링크(또는 영상 ID)
//
// 보안 원칙
//  - 접속하는 주소는 www.youtube.com 고정, 요청마다 시간·크기 제한
//  - 영상 ID·채널 ID는 정해진 형식만 통과, 글자는 길이 제한·제어문자 제거 후 저장
//  - 화면에 넣을 때는 프런트엔드에서 다시 한 번 이스케이프(이중 방어)
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get, clean, decodeXml, parseLink, resolveChannel, fetchVideo, fetchChannelAvatar, isAvatarUrl, VIDEO_ID, CHANNEL_ID } from "./youtube.mjs";
import { apiKey, listUploads, viewCounts, listPlaylists, playlistVideoIds } from "./youtube-api.mjs";
import { assignSeries } from "./series.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANNELS_FILE = resolve(ROOT, "channels.json");
// 채널 재생목록 저장 (작품 묶기용, 하루 1번 갱신) – 사이트에는 올리지 않는 내부 파일
const PLAYLISTS_FILE = resolve(ROOT, "cache/playlists.json");
const DATA_DIR = resolve(ROOT, "public/data");   // 웹에 공개되는 폴더는 public/ 뿐
const OUT_FILE = resolve(DATA_DIR, "videos.json");
const DESC_FILE = resolve(DATA_DIR, "desc.json");
const META_FILE = resolve(DATA_DIR, "meta.json");
const MAX_VIDEOS = 3000;        // 보관할 최대 영상 수 (직접 추가한 영상은 항상 보관)
const MAX_CHANNELS = 200;
const MAX_MANUAL = 1000;
const AVATAR_REFRESH_HOURS = 24; // 채널 프로필 사진은 하루 1번만 다시 확인
const VIEWS_REFRESH_HOURS = 6;  // 바뀐 게 조회수뿐이면 이 간격으로만 저장
const SKIP_SHORTS = true;       // 채널 자동 수집에서 쇼츠(Shorts) 영상 제외 (직접 추가한 영상은 그대로 보관)
const BACKFILL_MAX = 200;       // 공식 API 키가 있을 때 채널마다 가져올 예전 영상 최대 수
const BACKFILL_HOURS = 24;      // 채널마다 하루 1번 전체 목록 다시 확인 (API 정책: 저장 데이터 주기적 갱신)

// 채널/영상 설정의 카테고리 → 배열 (예전 단일 category 도 지원, 최대 10개)
export const catsOf = (x) => {
  const raw = Array.isArray(x?.categories) ? x.categories : [x?.category];
  const out = [...new Set(raw.map((c) => clean(c, 30)).filter(Boolean))].slice(0, 10);
  return out.length ? out : ["기타"];
};

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1].trim()) : "";
};
const attr = (xml, name, a) => {
  const m = xml.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`));
  return m ? decodeXml(m[1]) : "";
};

export function parseFeed(xml, ch, cid) {
  const entries = xml.split("<entry>").slice(1, 51).map((e) => e.split("</entry>")[0]);
  return entries.map((e) => {
    const id = tag(e, "yt:videoId");
    const published = Date.parse(tag(e, "published"));
    if (!VIDEO_ID.test(id) || !Number.isFinite(published)) return null;
    const views = Number(attr(e, "media:statistics", "views"));
    return {
      id,
      cid,
      title: clean(tag(e, "title"), 200) || "(제목 없음)",
      description: clean(tag(e, "media:description"), 400),
      published: new Date(published).toISOString(),
      views: Number.isSafeInteger(views) && views > 0 ? views : 0,
      channel: clean(ch.name || tag(e, "name"), 80),
      categories: catsOf(ch),
      short: attr(e, "link", "href").includes("/shorts/"),
    };
  }).filter(Boolean);
}

const videoIdOf = (x) => {
  const r = parseLink(typeof x === "string" ? x : x?.url || x?.id);
  return r?.type === "video" ? r : null;
};

async function main() {
  const config = JSON.parse(await readFile(CHANNELS_FILE, "utf8"));
  const channels = Array.isArray(config.channels) ? config.channels.slice(0, MAX_CHANNELS) : [];
  const manual = Array.isArray(config.videos) ? config.videos.slice(0, MAX_MANUAL) : [];
  const exclude = new Set((Array.isArray(config.exclude) ? config.exclude : []).map((x) => videoIdOf(x)?.id).filter(Boolean));

  const existing = await readExisting();
  const map = new Map(existing.videos.map((v) => [v.id, v]));
  const prevIds = new Set(map.keys());
  const tracked = new Map();   // 채널ID → { name, categories }
  const srcs = {};             // 설정의 채널 주소/ID → 채널ID (관리자 화면에서 채널별 영상 수를 맞추기 위해)
  let failed = 0;              // 실패한 채널 수 (실패가 있으면 삭제 작업 보류)

  // 1) 채널 자동 수집
  for (const ch of channels) {
    const label = clean(ch?.name || ch?.url || ch?.handle || ch?.id, 80);
    try {
      const cid = await resolveChannel(ch);
      // 서로 다른 두 채널 주소가 같은 채널로 연결되면, 뒤에 있는 것은 이름이 덮어써지지 않게 건너뜀
      if (tracked.has(cid)) { console.warn(`✗ 채널 ${label}: 이미 등록된 '${tracked.get(cid).name}'과 같은 채널(${cid}) – 건너뜀`); continue; }
      let vids = null, src = "채널";
      if (SKIP_SHORTS) {
        // 유튜브가 채널마다 자동으로 만드는 "일반 영상만" 재생목록(UULF…): 쇼츠 없이 최근 일반 영상 15개
        // (채널 전체 피드는 최근 업로드 15개라, 쇼츠를 많이 올리는 채널은 일반 영상이 거의 안 남음)
        try {
          const xml = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${cid.slice(2)}`, { allow404: true });
          if (xml) { vids = parseFeed(xml, ch, cid).filter((v) => !v.short); src = "일반 영상 목록"; }
        } catch { /* 아래 채널 피드로 대체 */ }
      }
      if (!vids?.length) {
        const all = parseFeed(await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`), ch, cid);
        vids = SKIP_SHORTS ? all.filter((v) => !v.short) : all;
        src = "채널";
      }
      for (const v of vids) map.set(v.id, { ...map.get(v.id), ...v }); // 조회수 등 갱신
      srcs[clean(ch.id || ch.url || ch.handle, 200)] = cid;
      tracked.set(cid, { name: clean(ch.name, 80) || vids[0]?.channel || "", categories: catsOf(ch),
        series: ch.series && typeof ch.series === "object" ? ch.series : {} });   // 관리자 작품 설정
      console.log(`✓ 채널 ${label}: ${vids.length}개 (${src})`);
    } catch (err) {
      failed++;
      console.warn(`✗ 채널 ${label}: ${err.message}`);
    }
  }

  // 1-2) 공식 API로 예전 영상까지 (RSS는 최근 15개뿐) – YOUTUBE_API_KEY 가 있을 때만, 채널마다 하루 1번
  const backfilled = {};
  let didBackfill = false;
  let plCache = {};
  try { plCache = JSON.parse(await readFile(PLAYLISTS_FILE, "utf8")) || {}; } catch {}
  let plChanged = false;
  // 작품 묶기용 재생목록 (제작자가 만든 것) – 실패해도 수집은 계속
  async function refreshPlaylists(cid, t) {
    try {
      const lists = [];
      for (const p of (await listPlaylists(cid, { max: 60 })).filter((p) => p.count > 0 && p.count <= 500)) {
        lists.push({ t: p.title, ids: await playlistVideoIds(p.id, { max: 300 }) });
      }
      plCache[cid] = { at: new Date().toISOString(), lists };
      plChanged = true;
    } catch (err) { console.warn(`✗ 재생목록 ${t.name || cid}: ${err.message}`); }
  }
  if (apiKey()) {
    for (const [cid, t] of tracked) {
      const last = existing.backfilled?.[cid];
      const plAge = plCache[cid]?.at ? (Date.now() - new Date(plCache[cid].at)) / 3600e3 : Infinity;
      if (last && (Date.now() - new Date(last)) / 3600e3 < BACKFILL_HOURS) {
        backfilled[cid] = last;
        if (plAge >= BACKFILL_HOURS) await refreshPlaylists(cid, t);   // 재생목록만 아직 없으면 가져오기
        continue;
      }
      try {
        const list = await listUploads(cid, { max: BACKFILL_MAX, skipShorts: SKIP_SHORTS });
        const views = await viewCounts(list.map((v) => v.id));
        for (const v of list) {
          const prev = map.get(v.id);
          map.set(v.id, { ...prev, ...v, channel: t.name || v.channel, categories: t.categories,
            views: views.get(v.id) ?? prev?.views ?? 0, description: v.description || prev?.description || "" });
        }
        // 채널에서 삭제·비공개된 영상 정리 (가져온 범위 안에서만)
        if (list.length) {
          const ids = new Set(list.map((v) => v.id));
          const oldest = Math.min(...list.map((v) => new Date(v.published)));
          for (const [id, v] of map) if (v.cid === cid && !v.manual && !ids.has(id) && new Date(v.published) >= oldest) map.delete(id);
        }
        await refreshPlaylists(cid, t);
        backfilled[cid] = new Date().toISOString();
        didBackfill = true;
        console.log(`✓ API ${t.name || cid}: ${list.length}개`);
      } catch (err) {
        if (last) backfilled[cid] = last;
        console.warn(`✗ API ${t.name || cid}: ${err.message}`);
      }
    }
  }

  // 2) 직접 추가한 영상
  const manualIds = new Set();
  for (const m of manual) {
    const ref = videoIdOf(m);
    if (!ref) { console.warn("✗ 영상 링크 형식 오류:", clean(m?.url ?? m, 80)); continue; }
    if (exclude.has(ref.id)) continue;
    manualIds.add(ref.id);
    const cats = catsOf(m);
    const prev = map.get(ref.id);
    if (prev) { // 이미 있는 영상: 카테고리·이름만 반영
      map.set(ref.id, { ...prev, manual: true, categories: cats, ...(m.name ? { channel: clean(m.name, 80) } : {}) });
      continue;
    }
    try {
      const v = await fetchVideo(ref.id);
      if (v.error) { console.warn(`✗ 영상 ${ref.id}: ${v.error}`); continue; }
      map.set(ref.id, { ...v, manual: true, short: ref.short, categories: cats, channel: clean(m.name, 80) || v.channel });
      console.log(`✓ 영상 추가: ${v.title}`);
    } catch (err) {
      console.warn(`✗ 영상 ${ref.id}: ${err.message}`);
    }
  }

  // 3) 숨기기 · 정리
  for (const id of exclude) map.delete(id);
  for (const [id, v] of map) {
    v.manual = manualIds.has(id);
    // 예전에 수집된 쇼츠도 정리 (직접 추가한 영상 제외)
    if (SKIP_SHORTS && v.short && !v.manual) { map.delete(id); continue; }
    const t = v.cid && tracked.get(v.cid);
    if (t && !v.manual) { v.categories = t.categories; if (t.name) v.channel = t.name; }
    // channels.json 에서 지운 채널의 영상은 삭제 (이번 실행에 실패한 채널이 있으면 안전하게 보류)
    if (!failed && !v.manual && v.cid && !tracked.has(v.cid)) map.delete(id);
    // videos 목록에서 지운 영상(채널 수집 영상이 아닌 것)도 삭제
    if (!failed && !v.manual && !v.cid && prevIds.has(id) && existing.manualIds.has(id)) map.delete(id);
  }

  // 4) 채널 프로필 사진 (유튜브 이미지 주소만 저장, 사진 파일은 이 서버에 복사하지 않음)
  const avatars = {};
  const avAge = existing.avatarsCheckedAt ? (Date.now() - new Date(existing.avatarsCheckedAt)) / 3600e3 : Infinity;
  const refreshAll = !(avAge < AVATAR_REFRESH_HOURS);
  let avatarsCheckedAt = refreshAll ? new Date().toISOString() : existing.avatarsCheckedAt;
  for (const cid of tracked.keys()) {
    const prev = existing.avatars?.[cid];
    if (!refreshAll && isAvatarUrl(prev)) { avatars[cid] = prev; continue; }
    try {
      const url = await fetchChannelAvatar(cid);
      if (url) avatars[cid] = url; else if (isAvatarUrl(prev)) avatars[cid] = prev;
    } catch (err) {
      if (isAvatarUrl(prev)) avatars[cid] = prev;
      console.warn(`✗ 프로필 사진 ${tracked.get(cid).name || cid}: ${err.message}`);
    }
  }

  const sorted = [...map.values()].sort((a, b) => new Date(b.published) - new Date(a.published));
  const videos = [...sorted.filter((v) => v.manual), ...sorted.filter((v) => !v.manual).slice(0, MAX_VIDEOS)]
    .sort((a, b) => new Date(b.published) - new Date(a.published));
  const added = videos.filter((v) => !prevIds.has(v.id)).length;

  // ── 전송량 절약: 바뀐 게 조회수뿐이면 VIEWS_REFRESH_HOURS 마다만 저장
  // 이번에 수집이 잠깐 실패한 채널은 예전 사진 유지, 사이트에서 사라진 채널의 사진은 정리
  const liveCids = new Set(videos.map((v) => v.cid).filter(Boolean));
  for (const cid of liveCids) if (!avatars[cid] && isAvatarUrl(existing.avatars?.[cid])) avatars[cid] = existing.avatars[cid];
  for (const cid of Object.keys(avatars)) if (!liveCids.has(cid)) delete avatars[cid];
  // 작품(시리즈) 정하기: 관리자 규칙 → 채널 재생목록 → 제목 분석
  const seriesConf = new Map();
  for (const [cid, t] of tracked) seriesConf.set(cid, t.series || {});
  const byCid = new Map();
  for (const v of videos) { if (!v.cid) continue; if (!byCid.has(v.cid)) byCid.set(v.cid, []); byCid.get(v.cid).push(v); }
  for (const [cid, list] of byCid) {
    const pl = (plCache[cid]?.lists || []).map((x) => ({ title: x.t, ids: x.ids }));
    let m = new Map();
    try { m = assignSeries(list.map((v) => ({ id: v.id, title: v.title })), pl, seriesConf.get(cid) || {}); } catch (err) { console.warn("작품 묶기 실패:", err.message); }
    for (const v of list) v.series = m.get(v.id) || "";
  }
  for (const cid of Object.keys(plCache)) if (!byCid.has(cid)) { delete plCache[cid]; plChanged = true; }
  if (plChanged) { await mkdir(dirname(PLAYLISTS_FILE), { recursive: true }); await writeFile(PLAYLISTS_FILE, JSON.stringify(plCache)); }
  for (const [k, cid] of Object.entries(existing.srcs || {})) if (!(k in srcs) && channels.some((c) => clean(c.id || c.url || c.handle, 200) === k)) srcs[k] = cid;
  const index = { ...buildIndex(videos), avatars, srcs };
  const age = existing.generatedAt ? (Date.now() - new Date(existing.generatedAt)) / 3600e3 : Infinity;
  if (signature(index) === signature({ ...buildIndex(existing.videos), avatars: existing.avatars || {}, srcs: existing.srcs || {} }) && age < VIEWS_REFRESH_HOURS && !refreshAll && !didBackfill) {
    console.log(`변경 없음 – 저장 생략 (마지막 저장 ${age.toFixed(1)}시간 전)`);
    // 영상은 그대로여도 관리자 설정(site.json: AI 도구 제휴 링크, 검색용 페이지 켜기/끄기 등)이 바뀌었을 수 있으니 페이지는 다시 생성 (바뀐 파일만 저장됨)
    try { await (await import("./seo.mjs")).buildSeo(); } catch (err) { console.warn("SEO 파일 생성 실패:", err.message); }
    return;
  }

  const generatedAt = new Date().toISOString();
  const desc = Object.fromEntries(videos.filter((v) => v.description).map((v) => [v.id, v.description]));
  const meta = { generatedAt, count: videos.length, latest: videos[0]?.id || null };

  await mkdir(DATA_DIR, { recursive: true });
  // 임시 파일에 쓴 뒤 교체 → 중간에 실패해도 반쯤 쓰인 파일이 공개되지 않음
  const save = async (file, obj) => { await writeFile(file + ".tmp", JSON.stringify(obj)); await rename(file + ".tmp", file); };
  await save(DESC_FILE, desc);
  await save(OUT_FILE, { v: 2, generatedAt, avatarsCheckedAt, backfilled, ...index });
  await save(META_FILE, meta);
  // 검색엔진용 sitemap·RSS·미리 그린 목록 갱신 (실패해도 영상 수집은 성공 처리)
  try { await (await import("./seo.mjs")).buildSeo(); } catch (err) { console.warn("SEO 파일 생성 실패:", err.message); }
  console.log(`완료: 총 ${videos.length}개 (신규 ${added}개, 삭제 ${[...prevIds].filter((id) => !map.has(id)).length}개)`);
}

// 압축 형식: 목록용 최소 정보를 배열로 저장 (첫 방문 시 1회 다운로드)
function buildIndex(videos) {
  const channels = [...new Set(videos.map((v) => v.channel || ""))];
  const cats = [...new Set(videos.flatMap((v) => v.categories?.length ? v.categories : ["기타"]))];
  const cids = [...new Set(videos.map((v) => v.cid || ""))];
  const series = [...new Set(videos.map((v) => v.series || "").filter(Boolean))];
  return {
    channels, cats, cids, series,
    fields: ["id", "title", "channel", "categories", "published", "views", "short", "cid", "manual", "series"],
    items: videos.map((v) => [
      v.id, v.title, channels.indexOf(v.channel || ""), (v.categories?.length ? v.categories : ["기타"]).map((c) => cats.indexOf(c)),
      Math.round(new Date(v.published) / 1000), v.views || 0, v.short ? 1 : 0,
      cids.indexOf(v.cid || ""), v.manual ? 1 : 0, v.series ? series.indexOf(v.series) : -1,
    ]),
  };
}
// 조회수를 뺀 내용이 같으면 "변경 없음"
const signature = (ix) => JSON.stringify([ix.channels, ix.cats, ix.cids, ix.series || [], ix.avatars || {}, ix.srcs || {}, ix.items.map((r) => r.filter((_, i) => i !== 5))]);

// 이전 저장 파일 읽기 (예전 형식 {videos:[…]} 과 압축 형식 모두 지원)
async function readExisting() {
  let raw;
  try { raw = JSON.parse(await readFile(OUT_FILE, "utf8")); } catch { return { videos: [], manualIds: new Set() }; }
  if (Array.isArray(raw.videos)) {
    return { ...raw, manualIds: new Set(), videos: raw.videos.filter((v) => v && VIDEO_ID.test(v.id)).map((v) => ({ ...v, categories: catsOf(v) })) };
  }
  let desc = {};
  try { desc = JSON.parse(await readFile(DESC_FILE, "utf8")); } catch {}
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((r) => Array.isArray(r) && VIDEO_ID.test(r[0]));
  const videos = items.map(([id, title, ch, cat, pub, views, short, cid, manual, ser]) => ({
    series: typeof raw.series?.[ser] === "string" ? raw.series[ser] : "",
    id, title, channel: raw.channels?.[ch] || "",
    categories: (Array.isArray(cat) ? cat : [cat]).map((i) => raw.cats?.[i]).filter(Boolean),
    published: new Date(pub * 1000).toISOString(), views, short: !!short,
    cid: CHANNEL_ID.test(raw.cids?.[cid] || "") ? raw.cids[cid] : null,
    manual: manual === 1, description: desc[id] || "",
  }));
  const avatars = Object.fromEntries(Object.entries(raw.avatars && typeof raw.avatars === "object" ? raw.avatars : {})
    .filter(([k, u]) => CHANNEL_ID.test(k) && isAvatarUrl(u)));
  const backfilled = Object.fromEntries(Object.entries(raw.backfilled && typeof raw.backfilled === "object" ? raw.backfilled : {})
    .filter(([k, t]) => CHANNEL_ID.test(k) && Number.isFinite(Date.parse(t))));
  const srcs = Object.fromEntries(Object.entries(raw.srcs && typeof raw.srcs === "object" ? raw.srcs : {}).filter(([k, v]) => typeof k === "string" && k.length <= 200 && CHANNEL_ID.test(v)));
  return { generatedAt: raw.generatedAt, avatarsCheckedAt: raw.avatarsCheckedAt, backfilled, srcs, avatars, videos, manualIds: new Set(videos.filter((v) => v.manual).map((v) => v.id)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

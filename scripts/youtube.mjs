// 유튜브 공통 도구: 안전한 요청, 링크 해석, 채널·영상 정보 조회
// (fetch-videos.mjs 와 add-from-issue.mjs 가 함께 사용)

const TIMEOUT_MS = 15000;           // 요청당 최대 대기 시간
const MAX_BYTES = 5 * 1024 * 1024;  // 응답 최대 크기 5MB
const UA = { "User-Agent": "Mozilla/5.0 (compatible; AllAICinemaBot/1.0)", "Accept-Language": "ko-KR,ko;q=0.9" };

export const VIDEO_ID = /^[\w-]{11}$/;
export const CHANNEL_ID = /^UC[\w-]{22}$/;
export const HANDLE = /^@?[\p{L}\p{N}._-]{3,100}$/u;

// 제어문자·방향전환 문자(제목 위장에 쓰임) 제거 + 길이 제한
export const clean = (s, max) => String(s ?? "")
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, " ")
  .trim().slice(0, max);

// 시간·크기 제한이 있는 안전한 요청 (www.youtube.com 만 허용)
export async function get(url, { allow404 = false } = {}) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "www.youtube.com") throw new Error("허용되지 않은 주소");
  const res = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    if (allow404 && [401, 403, 404].includes(res.status)) return null;
    throw new Error(`HTTP ${res.status}`);
  }
  const final = new URL(res.url || u);
  if (!final.hostname.endsWith("youtube.com")) throw new Error("다른 사이트로 이동됨");
  const len = Number(res.headers?.get?.("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("응답이 너무 큼");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("응답이 너무 큼");
  return text;
}

/**
 * 어떤 형태의 유튜브 링크든 해석합니다.
 *  영상: youtube.com/watch?v=ID, youtu.be/ID, /shorts/ID, /live/ID, /embed/ID, 영상ID(11자)
 *  채널: youtube.com/@핸들, /channel/UC…, /c/이름, /user/이름, @핸들, UC…(채널ID)
 * 반환: { type:"video", id, short } | { type:"channel", id } | { type:"channel", path } | null
 */
export function parseLink(input, { bareId = true } = {}) {
  const s = String(input ?? "").trim();
  if (!s || s.length > 300) return null;
  // bareId=false: 이슈 본문처럼 일반 글이 섞인 곳에서는 주소·@핸들만 인정 (11글자 단어를 영상ID로 오해 방지)
  if (bareId && VIDEO_ID.test(s)) return { type: "video", id: s, short: false };
  if (bareId && CHANNEL_ID.test(s)) return { type: "channel", id: s };
  if (!bareId && !/^(https?:\/\/|www\.|m\.|youtu|@)/i.test(s)) return null;
  if (s.startsWith("@") && HANDLE.test(s)) return { type: "channel", path: "/" + s };

  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let parts;
  try { parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return null; }

  if (host === "youtu.be") return VIDEO_ID.test(parts[0] || "") ? { type: "video", id: parts[0], short: false } : null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  const v = u.searchParams.get("v");
  if (parts[0] === "watch" && VIDEO_ID.test(v || "")) return { type: "video", id: v, short: false };
  if (["shorts", "live", "embed", "v"].includes(parts[0]) && VIDEO_ID.test(parts[1] || ""))
    return { type: "video", id: parts[1], short: parts[0] === "shorts" };
  if (parts[0] === "channel" && CHANNEL_ID.test(parts[1] || "")) return { type: "channel", id: parts[1] };
  if (parts[0]?.startsWith("@") && HANDLE.test(parts[0])) return { type: "channel", path: "/" + parts[0] };
  if (["c", "user"].includes(parts[0]) && /^[\p{L}\p{N}._-]{1,100}$/u.test(parts[1] || ""))
    return { type: "channel", path: `/${parts[0]}/${parts[1]}` };
  return null;
}

// 채널 설정({id} / {handle} / {url})을 채널 ID(UC…)로 변환
export async function resolveChannel(ch) {
  if (typeof ch?.id === "string" && CHANNEL_ID.test(ch.id)) return ch.id;
  const ref = ch?.handle ? parseLink(ch.handle.startsWith("@") ? ch.handle : "@" + ch.handle) : parseLink(ch?.url);
  if (!ref || ref.type !== "channel") throw new Error("채널 링크 형식이 올바르지 않음");
  if (ref.id) return ref.id;
  const html = await get("https://www.youtube.com" + ref.path.split("/").map((p) => encodeURIComponent(p).replace(/^%40/, "@")).join("/"));
  return channelIdFromPage(html);
}

// 채널 페이지에서 "그 채널 자신의" ID만 찾기.
// 페이지 안에는 추천 채널·관련 채널·댓글 작성자 등 다른 채널의 "channelId"도 많이 들어 있어서,
// 처음 보이는 channelId를 쓰면 엉뚱한 채널로 연결될 수 있다. (예: 웨이브트리 ↔ 씨네트릭스 뒤바뀜)
// → 페이지 자신을 가리키는 표시(canonical 주소, 메타데이터)만 보고, 서로 다르면 실패 처리한다.
const OWN_ID_PATTERNS = [
  /<link rel="canonical" href="https?:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
  /<meta property="og:url" content="https?:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
  /<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/,
  /"channelMetadataRenderer":\{[^{}]*?"externalId":"(UC[\w-]{22})"/,
  /"externalId":"(UC[\w-]{22})"/,
];
// 채널 프로필 사진 주소 (유튜브 이미지 서버 yt3.* 주소만 허용, 작은 크기로)
const AVATAR_URL = /^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[\w\-./=~%]{10,500}$/;
export function avatarFromPage(html) {
  const m = String(html).match(/<meta property="og:image" content="([^"]+)"/) ||
            String(html).match(/<link itemprop="thumbnailUrl" href="([^"]+)"/);
  if (!m) return "";
  const url = decodeXml(m[1]).replace(/=s\d+(-[^/?#]*)?$/, "=s88-c-k-c0x00ffffff-no-rj");
  return AVATAR_URL.test(url) ? url : "";
}
export const isAvatarUrl = (u) => typeof u === "string" && AVATAR_URL.test(u);
// 채널 고유번호로 채널 페이지를 열어 프로필 사진을 가져옴 (페이지가 그 채널 것인지도 확인)
export async function fetchChannelAvatar(cid) {
  if (!CHANNEL_ID.test(cid)) return "";
  const html = await get(`https://www.youtube.com/channel/${cid}`);
  let own = "";
  try { own = channelIdFromPage(html); } catch { /* 확인 불가 → 아래에서 버림 */ }
  return own === cid ? avatarFromPage(html) : "";
}

export function channelIdFromPage(html) {
  const found = new Set();
  for (const re of OWN_ID_PATTERNS) {
    const m = String(html).match(re);
    if (m) found.add(m[1]);
  }
  if (found.size > 1) throw new Error(`채널 ID가 여러 개라 확정하지 못함 (${[...found].join(", ")})`);
  if (!found.size) throw new Error("채널을 찾지 못함");
  return [...found][0];
}

// 채널 이름 조회 (RSS 피드의 채널 제목)
export async function channelTitle(id) {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { allow404: true });
  if (!xml) return null;
  const m = xml.split("<entry>")[0].match(/<title>([\s\S]*?)<\/title>/);
  return m ? clean(decodeXml(m[1]), 80) : "";
}

const fromCode = (n) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");
export const decodeXml = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
   .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => fromCode(parseInt(h, 16)))
   .replace(/&#(\d{1,7});/g, (_, n) => fromCode(+n))
   .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const jsonStr = (s) => { try { return JSON.parse(`"${s}"`); } catch { return ""; } };

/**
 * 영상 1개의 정보 조회 (API 키 불필요)
 *  - oEmbed: 제목·채널명 (외부 사이트 재생이 막힌 영상은 여기서 걸러짐)
 *  - 영상 페이지: 업로드 날짜·조회수·설명·채널ID (실패해도 기본값으로 진행)
 * 반환: 영상 객체 | { error }
 */
export async function fetchVideo(id) {
  if (!VIDEO_ID.test(id)) return { error: "영상 ID 형식이 올바르지 않음" };
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const oe = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { allow404: true });
  if (!oe) return { error: "비공개·삭제된 영상이거나, 다른 사이트에서 재생이 금지된 영상" };
  let info;
  try { info = JSON.parse(oe); } catch { return { error: "영상 정보를 읽지 못함" }; }

  let published = null, views = 0, description = "", cid = null;
  try {
    const html = await get(watch);
    const d = html.match(/itemprop="(?:datePublished|uploadDate)" content="([^"]+)"/) ||
              html.match(/"(?:publishDate|uploadDate)":"([^"]+)"/);
    if (d && Number.isFinite(Date.parse(d[1]))) published = new Date(Date.parse(d[1])).toISOString();
    const vc = html.match(/"viewCount":"(\d{1,15})"/);
    if (vc) views = Number(vc[1]);
    const ds = html.match(/"shortDescription":"((?:[^"\\]|\\.){0,5000})"/);
    if (ds) description = clean(jsonStr(ds[1]), 400);
    // 영상 자신의 채널만 (추천 영상의 채널 ID를 잘못 잡지 않도록 videoDetails / 메타 태그 우선)
    const c = html.match(/<meta itemprop="channelId" content="(UC[\w-]{22})"/) ||
              html.match(/"videoDetails":\{"videoId":"[\w-]{11}"[^{}]*?"channelId":"(UC[\w-]{22})"/);
    if (c) cid = c[1];
  } catch { /* 날짜·조회수는 없어도 추가는 진행 */ }

  return {
    id,
    title: clean(info.title, 200) || "(제목 없음)",
    channel: clean(info.author_name, 80),
    description,
    published: published || new Date().toISOString(),
    views: Number.isSafeInteger(views) ? views : 0,
    cid,
  };
}

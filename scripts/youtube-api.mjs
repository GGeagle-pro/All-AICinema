// YouTube Data API v3 (공식 API) – 채널의 예전 영상까지 가져오기 (RSS는 최근 15개 제한)
// GitHub Secrets 의 YOUTUBE_API_KEY 가 있을 때만 사용합니다. 키는 코드·로그·공개 파일에 절대 남기지 않습니다.
// 하루 무료 사용량 10,000 단위 중, 채널 1개 백필에 보통 2~10 단위만 씁니다.

import { clean, VIDEO_ID, CHANNEL_ID } from "./youtube.mjs";

const API = "https://www.googleapis.com/youtube/v3/";
const TIMEOUT_MS = 15000;

export const apiKey = () => {
  const k = String(process.env.YOUTUBE_API_KEY || "").trim();
  return /^[\w-]{20,60}$/.test(k) ? k : "";
};

async function apiGet(path, params) {
  const key = apiKey();
  if (!key) throw new Error("API 키 없음");
  const u = new URL(path, API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set("key", key);
  const res = await fetch(u, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) {
    // 오류 메시지에 키가 섞여 나오지 않도록 이유(reason)만 표시
    let reason = "";
    try { reason = (await res.json())?.error?.errors?.[0]?.reason || ""; } catch {}
    throw new Error(`API HTTP ${res.status}${reason ? " " + clean(reason, 60) : ""}`);
  }
  return res.json();
}

/**
 * 채널 업로드 목록 (최신순). skipShorts 이면 유튜브의 "일반 영상만" 재생목록(UULF)을 사용.
 * @returns {Promise<{id,title,description,published,channel,cid,short}[]>}
 */
export async function listUploads(cid, { max = 200, skipShorts = true } = {}) {
  if (!CHANNEL_ID.test(cid)) return [];
  const playlistId = (skipShorts ? "UULF" : "UU") + cid.slice(2);
  const out = [];
  let pageToken = "";
  while (out.length < max) {
    const d = await apiGet("playlistItems", {
      part: "snippet,contentDetails", playlistId, maxResults: 50, ...(pageToken ? { pageToken } : {}),
    });
    if (!d) break; // 재생목록 없음
    for (const it of Array.isArray(d.items) ? d.items : []) {
      const id = it?.contentDetails?.videoId;
      const sn = it?.snippet || {};
      if (!VIDEO_ID.test(id || "")) continue;
      if (sn.title === "Private video" || sn.title === "Deleted video") continue;
      const pub = Date.parse(it?.contentDetails?.videoPublishedAt || sn.publishedAt);
      if (!Number.isFinite(pub)) continue;
      out.push({
        id, cid,
        title: clean(sn.title, 200) || "(제목 없음)",
        description: clean(sn.description, 400),
        published: new Date(pub).toISOString(),
        channel: clean(sn.videoOwnerChannelTitle || sn.channelTitle, 80),
        short: false,
      });
    }
    pageToken = typeof d.nextPageToken === "string" ? d.nextPageToken : "";
    if (!pageToken) break;
  }
  return out.slice(0, max);
}

/** 조회수 (50개씩 묶어서 1단위) */
export async function viewCounts(ids) {
  const views = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await apiGet("videos", { part: "statistics", id: ids.slice(i, i + 50).join(","), maxResults: 50 });
    for (const it of d?.items || []) {
      const n = Number(it?.statistics?.viewCount);
      if (VIDEO_ID.test(it?.id || "") && Number.isSafeInteger(n)) views.set(it.id, n);
    }
  }
  return views;
}

/**
 * 영상 정보 (공식 API, 50개당 1단위): 제목·채널·업로드 날짜·조회수·설명·외부 재생 허용·아동용 여부
 * → Map(영상ID → {...}). 비공개·삭제 영상은 결과에 없음. (유튜브 페이지를 직접 읽지 않음 – 개발자 정책 준수)
 */
export async function videoDetails(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await apiGet("videos", { part: "snippet,statistics,status", id: ids.slice(i, i + 50).join(","), maxResults: 50 });
    for (const it of d?.items || []) {
      if (!VIDEO_ID.test(it?.id || "")) continue;
      const sn = it.snippet || {}, st = it.status || {};
      out.set(it.id, {
        title: clean(sn.title, 200), channel: clean(sn.channelTitle, 80), cid: CHANNEL_ID.test(sn.channelId || "") ? sn.channelId : "",
        published: Number.isFinite(Date.parse(sn.publishedAt)) ? new Date(sn.publishedAt).toISOString() : "",
        views: Number(it.statistics?.viewCount) || 0, description: clean(sn.description, 400),
        embeddable: st.embeddable !== false, kids: st.madeForKids === true,
      });
    }
  }
  return out;
}

/** @핸들 / 예전 사용자 이름 → 채널 ID (공식 API, 1단위) */
export async function channelIdFor({ handle = "", username = "" }) {
  const params = handle ? { part: "id", forHandle: handle.startsWith("@") ? handle : "@" + handle } : { part: "id", forUsername: username };
  const d = await apiGet("channels", params);
  const id = d?.items?.[0]?.id || "";
  return CHANNEL_ID.test(id) ? id : "";
}

/** 다른 사이트에서 재생 허용 여부 (status.embeddable) → Map(id → true/false). 비공개·삭제 영상은 결과에 없음. 50개당 1단위 */
export async function embedStatus(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await apiGet("videos", { part: "status", id: ids.slice(i, i + 50).join(","), maxResults: 50 });
    for (const it of d?.items || []) if (VIDEO_ID.test(it?.id || "") && typeof it?.status?.embeddable === "boolean") out.set(it.id, it.status.embeddable);
  }
  return out;
}

/** 영상 → 채널 ID (직접 추가한 영상의 채널 사진을 찾기 위해) → Map(영상ID → 채널ID). 50개당 1단위 */
export async function videoChannels(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await apiGet("videos", { part: "snippet", id: ids.slice(i, i + 50).join(","), maxResults: 50 });
    for (const it of d?.items || []) if (VIDEO_ID.test(it?.id || "") && CHANNEL_ID.test(it?.snippet?.channelId || "")) out.set(it.id, it.snippet.channelId);
  }
  return out;
}

/** 채널 프로필 사진 (공식 API, 유튜브 채널에 지금 걸려 있는 사진) → Map(채널ID → yt3 주소). 50개당 1단위 */
export async function channelAvatars(cids) {
  const out = new Map(), ok = /^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[\w\-./=~%]{10,500}$/;
  const list = cids.filter((c) => CHANNEL_ID.test(c));
  for (let i = 0; i < list.length; i += 50) {
    const d = await apiGet("channels", { part: "snippet", id: list.slice(i, i + 50).join(","), maxResults: 50 });
    for (const it of d?.items || []) {
      const th = it?.snippet?.thumbnails || {};
      const u = String(th.high?.url || th.medium?.url || th.default?.url || "").replace(/=s\d+(-[^/?#]*)?$/, "=s176-c-k-c0x00ffffff-no-rj");
      if (CHANNEL_ID.test(it?.id || "") && ok.test(u)) out.set(it.id, u);
    }
  }
  return out;
}

/** 채널의 재생목록 (제작자가 직접 만든 것) */
export async function listPlaylists(cid, { max = 100 } = {}) {
  if (!CHANNEL_ID.test(cid)) return [];
  const out = [];
  let pageToken = "";
  while (out.length < max) {
    const d = await apiGet("playlists", { part: "snippet,contentDetails", channelId: cid, maxResults: 50, ...(pageToken ? { pageToken } : {}) });
    for (const it of d?.items || []) {
      if (!/^[\w-]{10,64}$/.test(it?.id || "")) continue;
      out.push({ id: it.id, title: clean(it?.snippet?.title, 120), count: Number(it?.contentDetails?.itemCount) || 0 });
    }
    pageToken = typeof d?.nextPageToken === "string" ? d.nextPageToken : "";
    if (!pageToken) break;
  }
  return out;
}

/** 재생목록 안의 영상 ID (순서대로) */
export async function playlistVideoIds(playlistId, { max = 300 } = {}) {
  const ids = [];
  let pageToken = "";
  while (ids.length < max) {
    const d = await apiGet("playlistItems", { part: "contentDetails", playlistId, maxResults: 50, ...(pageToken ? { pageToken } : {}) });
    if (!d) break;
    for (const it of d.items || []) { const id = it?.contentDetails?.videoId; if (VIDEO_ID.test(id || "")) ids.push(id); }
    pageToken = typeof d.nextPageToken === "string" ? d.nextPageToken : "";
    if (!pageToken) break;
  }
  return ids;
}

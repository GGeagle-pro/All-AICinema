// 채널 안의 영상을 "작품(시리즈)"별로 자동으로 묶기
//
// 방법
//  1) 제목을 구분자( | ㅣ │ ─ — - · 〈〉 【】 [] 《》 ! ? 등)로 잘라 조각을 만든다.
//  2) 조각에서 회차 표시(EP.3, 12화, 시즌2, 1~9화 몰아보기, 예고편 …)와 장르 꼬리말(AI드라마 …)을 지운다.
//     회차 표시가 붙어 있던 조각은 작품 이름일 가능성이 높아 가산점.
//  3) 같은 채널의 다른 영상 제목에도 나오는 조각(띄어쓰기·문장부호 무시)을 작품 이름으로 본다. (2편 이상)
//  4) 관리자가 정한 규칙(제목에 이 단어가 있으면 → 이 작품)이 항상 먼저 적용된다.
//
// 반환: Map(videoId → 작품 이름). 작품을 못 찾은 영상은 넣지 않는다(단편·공지 등).

const SEP = /\s+[|lㅣI│｜]\s+|[|ㅣ│｜]|\s[-–—─]\s|[─—]|\s·\s|[〈〉《》【】「」『』\[\]]|[!?！？]+(?:\s|$)|\s\/\s|\.{2,}|…/;
const MARK = /\b(?:ep|episode)\.?\s*\d+|\d+\s*(?:화|회|편|부)\b|\d+\s*(?:화|회|편|부)(?=\s|$|[^가-힣])|(?:시즌|season)\s*\d+|\bs\d+\s*ep|몰아\s*보기|모아\s*보기|통합본|완결판|최종화|마지막화|\d+\s*[~-]\s*\d+\s*화/i;
const EP = new RegExp([
  "\\b(?:ep|e|episode|epi)\\.?\\s*\\d+(?:\\s*[-~+]\\s*\\d+)?", // EP.3, EP 3~5, Episode 2
  "\\d+\\s*(?:[-~～+]\\s*\\d+\\s*)?(?:화|회|편|부|장)", // 3화, 1~9화, 2부, 3장
  "(?:시즌|season|s)\\s*\\d+", "(?:part|파트)\\s*\\d+",
  "\\d+\\s*[-~～]\\s*\\d+",
  "제\\s*\\d+\\s*(?:화|장|부)",
  "몰아\\s*보기|모아\\s*보기|통합본|완결판|완전판|전편|합본|최종화|최종회|마지막화|프롤로그|에필로그|외전|번외|스페셜|special",
  "예고편|티저|티져|trailer|teaser|finale|final|full|complete\\s*series|official\\s*(?:video|trailer|teaser)",
  "\\[?eng\\s*sub\\]?|ost|엔딩곡|오프닝",
].join("|"), "gi");
// 작품 이름으로 쓰기엔 너무 흔한 말 (이것들로만 이뤄진 조각은 버림)
const GENERIC = /^(?:ai|AI|에이아이|드라마|영화|애니메이션|애니|웹드라마|숏드라마|단편|판타지|조선|조선판타지|이세계|액션|무협|로맨스|스릴러|공포|코미디|사이다|참교육|official|video|mv|k-drama|original|series|kdrama|original k-drama series|the|그|이|그 후의 이야기|그 이후의 이야기|몰아보기|모음|모음집|시즌|ep|화|편|\s|·|,|&|\+|-|\d)+$/i;
const GENRE_TAIL = /\s*(?:ai\s*(?:드라마|영화|애니메이션|액션\s*드라마|판타지\s*드라마)|이세계\s*판타지|조선\s*판타지|판타지\s*액션\s*드라마|액션\s*드라마|ai드라마)\s*$/i;

const keyOf = (s) => s.toLowerCase().replace(/\([^)]*[a-z][^)]*\)/gi, "").replace(/[\s\p{P}\p{S}]+/gu, "");

function candidates(title) {
  const t = String(title || "")
    .replace(/#[^\s#]+/g, " ")                        // 해시태그
    .replace(/\p{Extended_Pictographic}|️/gu, " ") // 이모지
    .replace(/["“”'‘’]/g, " ");
  const out = [];
  const segs = [];
  for (const seg of t.split(SEP)) {
    if (!seg) continue;
    segs.push(seg);
    // "미지의 여행 EP.2: 사막의 도시" → 회차 표시 앞부분 "미지의 여행"도 후보로
    EP.lastIndex = 0; const m = EP.exec(seg); EP.lastIndex = 0;
    if (m && m.index > 1) segs.push(seg.slice(0, m.index) + " EP1");
    // "미지의 여행 : 지하도시" → 쌍점 앞부분도 후보로 (RE:GENESIS 처럼 붙어 있는 건 제외)
    const c = seg.match(/^(.{2,30}?)\s+[:：]\s|^(.{2,30}?)[:：]\s/);
    if (c && /[가-힣]/.test(c[1] || c[2])) segs.push(c[1] || c[2]);   // 한글 이름만 (HWARANG: ZERO 는 그대로)
  }
  for (let seg of segs) {
    const had = EP.test(seg); EP.lastIndex = 0;
    let base = seg.replace(EP, " ").replace(GENRE_TAIL, "").replace(/\s{2,}/g, " ")
      .replace(/^[\s\p{P}\p{S}\d]+|[\s\p{P}\p{S}]+$/gu, "").trim();
    // "글로리아 판타지아(Gloria Fantasia)" → 괄호 속 영문 병기는 이름에서 뺌
    base = base.replace(/\s*\([^)]*[A-Za-z][^)]*\)\s*$/, "").replace(/\s*\([^)]*$/, "").trim();
    if (base.length < 2 || base.length > 32 || GENERIC.test(base)) continue;
    const k = keyOf(base);
    if (k.length < 2) continue;
    out.push({ name: base, key: k, had });
  }
  return out;
}

/**
 * @param {{id:string,title:string}[]} videos 한 채널의 영상
 * @param {{name:string, match:string[]}[]} rules 관리자 규칙 (제목에 match 중 하나가 있으면 name)
 */
export function detectSeries(videos, rules = []) {
  const result = new Map();
  const ruleKeys = rules.map((r) => ({ name: r.name, keys: (r.match?.length ? r.match : [r.name]).map(keyOf).filter((k) => k.length >= 2) }));
  const cands = new Map();
  for (const v of videos) {
    const tk = keyOf(v.title);
    const rule = ruleKeys.find((r) => r.keys.some((k) => tk.includes(k)));
    if (rule) { result.set(v.id, rule.name); continue; }
    cands.set(v.id, candidates(v.title));
  }
  // 조각이 몇 개의 영상에 나오는지 (영상당 1번)
  const freq = new Map(), names = new Map();
  for (const list of cands.values()) {
    for (const k of new Set(list.map((c) => c.key))) freq.set(k, (freq.get(k) || 0) + 1);
    for (const c of list) { const m = names.get(c.key) || new Map(); m.set(c.name, (m.get(c.name) || 0) + 1); names.set(c.key, m); }
  }
  // 다른 작품 이름을 포함하는 긴 조각은 짧은 쪽으로 (예: "낙하 707 리부트" ⊃ "낙하 707")
  const strong = [...freq].filter(([, n]) => n >= 2).map(([k]) => k).sort((a, b) => a.length - b.length);
  const canonical = (k) => strong.find((s) => s !== k && s.length >= 3 && k.startsWith(s) && freq.get(s) >= freq.get(k)) || k;
  const marked = new Map();
  const titleOf = new Map(videos.map((v) => [v.id, v.title]));
  for (const [id, list] of cands) {
    let best = null, bestScore = 0;
    for (const c of list) {
      const n = freq.get(c.key) || 0;
      if (n < 2) continue;
      const score = n + (c.had ? 3 : 0) + Math.min(c.key.length, 12) / 24;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) continue;
    const k = canonical(best.key);
    const pick = [...(names.get(k) || names.get(best.key))].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
    result.set(id, pick);
    marked.set(id, MARK.test(titleOf.get(id) || ""));
  }
  // 회차 표시(EP·화)가 거의 없는 묶음은 채널 영상의 30% 이상일 때만 인정
  // (예: "초능력소녀 세아 - 고마의 피" 는 인정, 매번 다른 이야기의 "노후사연"·"Explosive action" 같은 말은 제외)
  const groups = new Map();
  for (const [id, n] of result) { const g = groups.get(n) || { ids: [], marked: 0 }; g.ids.push(id); if (marked.get(id)) g.marked++; groups.set(n, g); }
  for (const [, g] of groups) {
    const share = g.ids.length / Math.max(1, videos.length);
    const ok = g.marked >= Math.max(2, g.ids.length / 2) || (g.ids.length >= 3 && share >= 0.3) || (g.ids.length >= 2 && share >= 0.6);
    if (!ok) for (const id of g.ids) result.delete(id);
  }
  // 한 채널에서 작품이 하나뿐이고 거의 모든 영상이 거기 속하면 그대로 (채널 = 작품)
  return result;
}

// ===== 재생목록으로 묶기 =====
// 작품이 아닌 재생목록(모음·메이킹·뮤직비디오·OST·쇼츠 등)은 버리고, 시즌·부 표시는 지워서 같은 작품으로 합침
const NOT_WORK = /메이킹|making|비하인드|behind|뮤직\s*비디오|music\s*video|\bmv\b|ost|soundtrack|사운드트랙|숏폼|shorts?\b|#shorts|playlist|플레이리스트|작업실|collab|brand|브랜드|오리지널\s*(?:무비|드라마)|original\s*(?:movie|drama)|좋아하는\s*노래|노래|트로트|예고\s*&|하이라이트|^모아보기$|^몰아보기$|^전체\s*영상$|^인기|^최신|^업로드/i;
const GENRE_ONLY = /^(?:ai\s*)?(?:현대\s*|조선\s*|이세계\s*)?(?:판타지|액션|sf|무협|로맨스|오피스|스릴러|공포|코미디|휴먼|가족)?\s*(?:드라마|영화|애니메이션|시리즈)$/i;
function cleanWork(seg) {
  let t = seg.replace(/\s*「[^」]*」.*$/, "")
    .replace(/\s*[—–-]?\s*(?:season|시즌)\s*\d+.*$/i, "")
    .replace(/\s*(?:\d+\s*부|프롤로그|에필로그|본편|외전|전편\s*몰아보기|전체\s*(?:시청하기|보기|재생)|정주행.*|처음부터.*|start\s*here|\d+\s*화부터.*|\d+\s*[~-]\s*\d+\s*화.*|몰아보기|모아보기)\s*$/i, "")
    .replace(/\s*\([^)]*[A-Za-z][^)]*\)\s*/g, " ")             // (Bound Chronicles)
    .replace(/\s*\[[^\]]*\]\s*$/, "");                        // [화랑 제로]
  if (/[가-힣]/.test(t)) t = t.replace(/(?:\s+[A-Za-z][A-Za-z0-9!?.:'’&-]*)+[!?.\s]*$/, "");   // 한글 이름 뒤 영문 병기
  t = t.replace(/[\s:—–\-!?.,]+$/, "").replace(/\s{2,}/g, " ").trim();
  return t.length >= 2 && t.length <= 40 && !GENERIC.test(t) && !GENRE_ONLY.test(t) ? t : "";
}
function workName(title) {
  const t = String(title || "")
    .replace(/\p{Extended_Pictographic}|\uFE0F/gu, " ")
    .replace(/^\s*\[[^\]]*\]\s*/, "")                       // 앞쪽 [SF드라마] [모아보기]
    .replace(/【([^】]+)】/g, "$1 ");
  // "처음부터 몰아보기 | FALL 707: REBOOT — Start Here" 처럼 앞 조각이 비면 다음 조각에서
  for (const seg of t.split(/\s+[|ㅣ│｜]\s+|\s[—–]\s(?=start|전체|1화)/i)) { const n = cleanWork(seg); if (n) return n; }
  return "";
}

/**
 * 채널 하나의 작품 정하기
 * @param videos  [{id,title}]
 * @param playlists [{title, ids:[...]}]  유튜브 재생목록 (없으면 [])
 * @param conf { rules:[{match, to}], rename:{원래이름: 새이름} }  관리자 설정 ("to"가 빈 문자열이면 묶지 않음)
 * @returns Map(id → 작품 이름)
 */
export function assignSeries(videos, playlists = [], conf = {}) {
  const site = new Set(videos.map((v) => v.id));
  const out = new Map();
  // 1) 재생목록 → 작품 (작은 재생목록이 더 구체적이라 우선)
  const works = [];
  for (const p of playlists) {
    if (NOT_WORK.test(p.title)) continue;
    const name = workName(p.title);
    const ids = (p.ids || []).filter((id) => site.has(id));
    if (!name || ids.length < 1) continue;
    if (ids.length >= Math.max(6, site.size * 0.9) && videos.length > 8) continue;   // 채널 전체 모음은 작품 아님
    const aliases = [...String(p.title).matchAll(/\(([^)]{4,40})\)|\[([^\]]{2,20})\]/g)].map((m) => keyOf(m[1] || m[2])).filter((k) => k.length >= 4 && !/드라마|몰아|모아|전체|1화/.test(k));
    works.push({ name, key: keyOf(name), ids, aliases: [keyOf(name), ...aliases] });
  }
  works.sort((a, b) => a.ids.length - b.ids.length);
  for (const w of works) for (const id of w.ids) if (!out.has(id)) out.set(id, w);
  // 2) 제목 분석 (재생목록에 없는 영상) – 제목 이름이 재생목록 작품과 주로 겹치면 그 작품으로
  const byTitle = detectSeries(videos);
  const titleToWork = new Map();
  for (const [id, n] of byTitle) {
    const w = out.get(id); if (!w) continue;
    const m = titleToWork.get(n) || new Map(); m.set(w, (m.get(w) || 0) + 1); titleToWork.set(n, m);
  }
  const result = new Map();
  for (const v of videos) {
    let w = out.get(v.id);
    if (!w) { const tk = keyOf(v.title); w = works.find((x) => x.aliases.some((a) => a.length >= 3 && tk.includes(a))); }
    if (w) { result.set(v.id, w.name); continue; }
    const n = byTitle.get(v.id); if (!n) continue;
    const m = titleToWork.get(n);
    result.set(v.id, m ? [...m].sort((a, b) => b[1] - a[1])[0][0].name : n);
  }
  // 이름 표시: 같은 작품을 제목에서 한글로 부르는 이름이 있으면 그걸로 (예: The Black Tower → 더블랙타워)
  const prefer = new Map();
  for (const [id, n] of result) {
    const tn = byTitle.get(id); if (!tn || keyOf(tn) === keyOf(n)) continue;
    if (/[가-힣]/.test(tn) && !/[가-힣]/.test(n)) { const m = prefer.get(n) || new Map(); m.set(tn, (m.get(tn) || 0) + 1); prefer.set(n, m); }
  }
  const total = new Map(); for (const n of result.values()) total.set(n, (total.get(n) || 0) + 1);
  for (const [n, m] of prefer) { const [tn, c] = [...m].sort((a, b) => b[1] - a[1])[0]; if (c >= Math.max(2, total.get(n) * 0.5)) for (const [id, x] of result) if (x === n) result.set(id, tn); }
  // 3) 관리자 설정: 키워드 규칙이 가장 먼저, 그다음 이름 바꾸기·합치기·묶지 않기
  const rules = (conf.rules || []).map((r) => ({ keys: String(r.match || "").split(",").map(keyOf).filter((k) => k.length >= 2), to: String(r.to ?? "").trim() })).filter((r) => r.keys.length);
  const rename = conf.rename || {};
  for (const v of videos) {
    const tk = keyOf(v.title);
    const rule = rules.find((r) => r.keys.some((k) => tk.includes(k)));
    let n = rule ? rule.to : result.get(v.id);
    if (n && Object.prototype.hasOwnProperty.call(rename, n)) n = String(rename[n] || "").trim();
    if (n) result.set(v.id, n.slice(0, 40)); else result.delete(v.id);
  }
  return result;
}

// 단독 실행: node scripts/series.mjs  → 지금 데이터로 묶인 결과 출력 (점검용)
if (process.argv[1] && process.argv[1].endsWith("series.mjs")) {
  const { readFile } = await import("node:fs/promises");
  const d = JSON.parse(await readFile(new URL("../public/data/videos.json", import.meta.url), "utf8"));
  const by = new Map();
  for (const x of d.items) { const ch = d.channels[x[2]]; if (!by.has(ch)) by.set(ch, []); by.get(ch).push({ id: x[0], title: x[1] }); }
  let total = 0, grouped = 0;
  for (const [ch, vids] of by) {
    const m = detectSeries(vids);
    const count = new Map(); for (const n of m.values()) count.set(n, (count.get(n) || 0) + 1);
    total += vids.length; grouped += m.size;
    console.log(`\n## ${ch} (${m.size}/${vids.length}) → ${[...count].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}(${c})`).join(", ") || "-"}`);
    if (process.argv.includes("-v")) for (const v of vids) console.log(`   ${m.get(v.id) ? "[" + m.get(v.id) + "]" : "[ -- ]"} ${v.title.slice(0, 70)}`);
  }
  console.log(`\n묶인 영상 ${grouped}/${total}`);
}
export { workName as _workName, NOT_WORK as _NOT_WORK };

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
  for (let seg of t.split(SEP)) {
    if (!seg) continue;
    const had = EP.test(seg); EP.lastIndex = 0;
    let base = seg.replace(EP, " ").replace(GENRE_TAIL, "").replace(/\s{2,}/g, " ")
      .replace(/^[\s\p{P}\p{S}\d]+|[\s\p{P}\p{S}]+$/gu, "").trim();
    // "글로리아 판타지아(Gloria Fantasia)" → 괄호 속 영문 병기는 이름에서 뺌
    base = base.replace(/\s*\([^)]*[A-Za-z][^)]*\)\s*$/, "").trim();
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
  }
  // 한 채널에서 작품이 하나뿐이고 거의 모든 영상이 거기 속하면 그대로 (채널 = 작품)
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

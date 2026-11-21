// 검색엔진(구글·네이버·다음) 최적화 파일 만들기
//  - public/sitemap.xml : 사이트 주소 목록 (서치콘솔·서치어드바이저에 제출)
//  - public/rss.xml     : 최신 영상 50개 (네이버 서치어드바이저 RSS 제출용)
//  - public/index.html  : <!--SSR--> 표시 사이에 최신 영상 목록을 HTML로 미리 넣음
//                         (자바스크립트를 실행하지 않는 검색 로봇도 내용을 읽을 수 있게)
// fetch-videos.mjs 가 영상 목록을 저장할 때마다 자동 실행. 단독 실행: node scripts/seo.mjs

import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = resolve(ROOT, "public");
const SITE = "https://all-aicinema.syncbrain100.com";
const NAME = "All AI-Cinema";
const SSR_COUNT = 24;
const RSS_COUNT = 50;
const VIDEO_ID = /^[\w-]{11}$/;

const xml = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const html = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// JSON-LD 안에서 </script> 로 빠져나가지 못하게
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

async function atomicWrite(file, text) { await writeFile(file + ".tmp", text); await rename(file + ".tmp", file); }

async function loadVideos() {
  const d = JSON.parse(await readFile(resolve(PUB, "data/videos.json"), "utf8"));
  let desc = {};
  try { desc = JSON.parse(await readFile(resolve(PUB, "data/desc.json"), "utf8")); } catch {}
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    generatedAt: d.generatedAt || new Date().toISOString(),
    videos: items.map((x) => ({
      id: x[0], title: String(x[1] || ""), channel: String(d.channels?.[x[2]] || ""),
      categories: (Array.isArray(x[3]) ? x[3] : [x[3]]).map((k) => d.cats?.[k]).filter(Boolean),
      published: new Date((x[4] || 0) * 1000).toISOString(), views: x[5] || 0, short: x[6] === 1,
      description: String(desc[x[0]] || ""),
    })).filter((v) => VIDEO_ID.test(v.id))
      .sort((a, b) => new Date(b.published) - new Date(a.published)),
  };
}

function sitemap(lastmod) {
  const urls = [
    { loc: `${SITE}/`, lastmod, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE}/about.html`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE}/privacy.html`, changefreq: "yearly", priority: "0.2" },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${xml(u.lastmod)}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>
`;
}

function rss(videos, lastmod) {
  const items = videos.slice(0, RSS_COUNT).map((v) => `    <item>
      <title>${xml(cut(v.title, 200))}</title>
      <link>${SITE}/?v=${v.id}</link>
      <guid isPermaLink="false">yt:${v.id}</guid>
      <pubDate>${new Date(v.published).toUTCString()}</pubDate>
      <dc:creator>${xml(v.channel)}</dc:creator>
      ${v.categories.map((c) => `<category>${xml(c)}</category>`).join("")}
      <description>${xml(cut(`${v.channel} · ${v.description || v.title}`, 300))}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${NAME} – 새로 올라온 AI 영화·드라마</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>AI가 만든 영화·드라마·단편을 한곳에서 모아보는 사이트의 최신 영상</description>
    <language>ko</language>
    <lastBuildDate>${new Date(lastmod).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

// 검색 로봇용 미리 그린 목록 (사이트가 열리면 자바스크립트가 같은 자리를 새 화면으로 바꿈)
function ssrBlock(videos) {
  const list = videos.slice(0, SSR_COUNT);
  const cards = list.map((v) => `<a class="card" href="?v=${v.id}"><div class="thumb"><img loading="lazy" decoding="async" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" width="320" height="180" alt="${html(cut(v.title, 120))}" /></div><div class="card__body"><div><h3>${html(v.title)}</h3><p>${html(v.channel)}</p></div></div></a>`).join("\n");
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: "새로 올라온 AI 영화·드라마",
    itemListElement: list.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/?v=${v.id}`, name: cut(v.title, 150) })),
  };
  return `<!--SSR-->\n${cards}\n<script type="application/ld+json">${jsonLd(ld)}</script>\n<!--/SSR-->`;
}

export async function buildSeo() {
  const { videos, generatedAt } = await loadVideos();
  await atomicWrite(resolve(PUB, "sitemap.xml"), sitemap(generatedAt));
  await atomicWrite(resolve(PUB, "rss.xml"), rss(videos, generatedAt));
  const file = resolve(PUB, "index.html");
  const page = await readFile(file, "utf8");
  const next = page.replace(/<!--SSR-->[\s\S]*?<!--\/SSR-->/, () => ssrBlock(videos));
  if (next !== page) await atomicWrite(file, next);
  console.log(`SEO: sitemap.xml, rss.xml(${Math.min(videos.length, RSS_COUNT)}개), index.html 미리보기 ${Math.min(videos.length, SSR_COUNT)}개`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSeo().catch((e) => { console.error(e); process.exit(1); });
}

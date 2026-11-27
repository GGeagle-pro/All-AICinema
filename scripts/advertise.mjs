// 광고·홍보 안내 페이지 (7개 언어): /advertise/, /en/advertise/ … – 자체 배너(메인·띠) 예약 광고 판매 안내, 메일 문의
//  - 글: advertise-text.mjs, 숫자(영상·채널 수)는 수집 때마다 갱신. 광고 없음(noAds). seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, loadAll, HTML_LANG, HOME } from "./pages.mjs";
import { ADV, ADV_PATH } from "./advertise-text.mjs";

const LANGS = ["ko", "en", "ja", "zh", "es", "vi", "ar"];
const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar" };
const MAIL = "champkj79@gmail.com";

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildAdvertise({ PUB, SITE, loadI18n, ver }) {
  const { videos } = await loadAll(PUB);
  const floor = (n) => (n >= 1000 ? Math.floor(n / 100) * 100 : n);
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${ADV_PATH(l)}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/advertise/" />`;
  const altXml = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${ADV_PATH(l)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/advertise/"/>`;
  let changed = 0;
  for (const l of LANGS) {
    const T = ADV[l], I = await loadI18n(l), url = SITE + ADV_PATH(l);
    const fmt = (n) => new Intl.NumberFormat(HTML_LANG[l]).format(n);
    const n = { videos: fmt(floor(videos.length)), channels: fmt(new Set(videos.map((v) => v.channel)).size) };
    const mailto = `mailto:${MAIL}?subject=${encodeURIComponent(T.subject)}&body=${encodeURIComponent(T.body)}`;
    const ul = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(I.t("홈"))}</a> › <span>${esc(T.crumb)}</span></nav>
    <h1 class="pg-title">${esc(T.h1)}</h1>
    <p class="pg-desc">${esc(T.lead(n))}</p>
    <section class="pg-sec"><h2>${esc(T.whoH)}</h2>${ul(T.who)}</section>
    <section class="pg-sec"><h2>${esc(T.slotsH)}</h2><dl class="intro-info">${T.slots.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl></section>
    <section class="pg-sec"><h2>${esc(T.optH)}</h2>${ul(T.opt)}</section>
    <section class="pg-sec"><h2>${esc(T.ruleH)}</h2>${ul(T.rule)}</section>
    <section class="pg-sec" id="contact"><h2>${esc(T.howH)}</h2><p>${esc(T.how)}</p>
      <p class="adv-mail"><b>${MAIL}</b></p>
      <p><a class="btn btn--primary" href="${esc(mailto)}">${esc(T.mailBtn)} ✉</a></p></section>`;
    const ld = [{ "@context": "https://schema.org", "@type": "WebPage", name: T.title, url, inLanguage: HTML_LANG[l] },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: I.t("홈"), item: SITE + HOME[l] }, { "@type": "ListItem", position: 2, name: T.crumb, item: url }] }];
    const html = shell({ lang: l, title: `${T.title} | All AI-Cinema`, desc: T.lead(n).slice(0, 155), url, image: `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: alts, noAds: true });
    if (await writeIfChanged(resolve(PUB, ADV_PATH(l).slice(1), "index.html"), html)) changed++;
  }
  return { changed, urls: LANGS.map((l) => ({ loc: SITE + ADV_PATH(l), alts: altXml })) };
}

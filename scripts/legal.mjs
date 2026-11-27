// 이용약관·개인정보처리방침 – 일본어·중국어·스페인어·베트남어·아랍어 페이지 (/ja/terms/, /ja/privacy/ …)
//  - 글은 legal-text.mjs, 한국어·영어는 기존 정적 페이지(terms.html, privacy.html, en/*.html)
//  - 광고 없음(noAds). seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HOME, HTML_LANG } from "./pages.mjs";
import { LEGAL } from "./legal-text.mjs";
import { INTRO } from "./intro-text.mjs";

const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar", de: "de", fr: "fr", it: "it" };
const PATH = { terms: (l) => (l === "ko" ? "/terms.html" : l === "en" ? "/en/terms.html" : `/${l}/terms/`), privacy: (l) => (l === "ko" ? "/privacy.html" : l === "en" ? "/en/privacy.html" : `/${l}/privacy/`) };
const ALL = ["ko", "en", ...Object.keys(LEGAL)];

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildLegal({ PUB, SITE, loadI18n, ver }) {
  let changed = 0; const urls = [];
  for (const kind of ["terms", "privacy"]) {
    const alts = ALL.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${PATH[kind](l)}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}${PATH[kind]("en")}" />`;
    const altXml = ALL.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${PATH[kind](l)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${PATH[kind]("en")}"/>`;
    for (const l of Object.keys(LEGAL)) {
      const D = LEGAL[l][kind], I = await loadI18n(l), url = SITE + PATH[kind](l);
      const sec = D.s.map(([h, ps]) => {
        const li = ps.filter((p) => p.startsWith("•")), pp = ps.filter((p) => !p.startsWith("•"));
        return `<section class="pg-sec"><h2>${esc(h)}</h2>${pp.map((p) => `<p>${p}</p>`).join("")}${li.length ? `<ul>${li.map((p) => `<li>${p.slice(1).trim()}</li>`).join("")}</ul>` : ""}</section>`;
      }).join("\n    ");
      const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(INTRO[l].home)}</a> › <span>${esc(D.title)}</span></nav>
    <h1 class="pg-title">${esc(D.title)}</h1>
    <p class="muted">${esc(D.eff)}</p>
    <p class="pg-desc">${esc(D.intro)}</p>
    ${sec}`;
      const html = shell({ lang: l, title: `${D.title} – All AI-Cinema`, desc: D.intro, url, image: `${SITE}/og-image.jpg?v=3`, ogType: "website",
        ld: [{ "@context": "https://schema.org", "@type": "WebPage", name: D.title, url, inLanguage: HTML_LANG[l] }], body, I, ver, head: alts, noAds: true });
      if (await writeIfChanged(resolve(PUB, PATH[kind](l).slice(1), "index.html"), html)) changed++;
      urls.push({ loc: url, alts: altXml });
    }
  }
  return { changed, urls };
}

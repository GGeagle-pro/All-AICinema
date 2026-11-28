// AI 제작 도구 상세 페이지: /tools/<id>/, /en/tools/<id>/ … (글이 있는 언어만)
//  - 글: tooldetail-text.mjs, 도구 이름·주소·분류: data/tools.json, 제휴 링크: site.json tools { id: { link, on } }
//  - 광고 있음(소프트웨어 광고 단가가 높은 주제). 제휴 링크는 rel="sponsored nofollow" + 고지. seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HTML_LANG, HOME } from "./pages.mjs";
import { TD, MAKER, ALT } from "./tooldetail-text.mjs";
import { HOWTO_PATH } from "./howto-text.mjs";

const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar", de: "de", fr: "fr", it: "it" };
export const TOOL_HUB = (l) => (l === "ko" ? "/tools/" : `/${l}/tools/`);
export const TOOL_PATH = (l, id) => `${TOOL_HUB(l)}${id}/`;
// 제목이 길면(검색 결과에서 잘림) 짧은 제목으로
const SHORT = { ko: (n) => `${n} 사용법·장단점`, en: (n) => `${n} review: pros, cons & tips`, ja: (n) => `${n}の使い方と特徴`, zh: (n) => `${n}使用方法与优缺点`, es: (n) => `${n}: pros, contras y consejos`, vi: (n) => `${n}: ưu nhược điểm và mẹo`, ar: (n) => `${n}: المزايا والعيوب`, de: (n) => `${n}: Vor- und Nachteile, Tipps`, fr: (n) => `${n} : avis, atouts et limites`, it: (n) => `${n}: pro, contro e consigli` };
const width = (t) => [...String(t)].reduce((n, c) => n + (/[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(c) ? 2 : 1), 0);
const pickTitle = (l, L, n) => { const full = L.title(n); return width(full) <= 62 ? full : (SHORT[l] || L.title)(n); };
const safeUrl = (u) => { try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildToolDetail({ PUB, SITE, loadI18n, ver }) {
  let data = { tools: [], cats: {} }, site = {};
  try { data = JSON.parse(await readFile(resolve(PUB, "data/tools.json"), "utf8")); } catch {}
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  const conf = site.tools && typeof site.tools === "object" ? site.tools : {};
  const tools = (data.tools || []).filter((x) => x && /^[a-z0-9-]{2,30}$/.test(x.id) && conf[x.id]?.on !== false).map((x) => {
    const aff = safeUrl(conf[x.id]?.link);
    return { ...x, href: aff || safeUrl(x.url), aff: !!aff };
  }).filter((x) => x.href);
  const byId = new Map(tools.map((x) => [x.id, x]));
  const langs = Object.keys(TD);
  let changed = 0; const urls = [];
  for (const t of tools) {
    const ls = langs.filter((l) => TD[l].tools?.[t.id]);
    if (!ls.length) continue;
    const xd = ls.includes("en") ? "en" : ls[0];
    const alts = ls.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${TOOL_PATH(l, t.id)}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}${TOOL_PATH(xd, t.id)}" />`;
    const altXml = ls.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${TOOL_PATH(l, t.id)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${TOOL_PATH(xd, t.id)}"/>`;
    for (const l of ls) {
      const L = TD[l], D = L.tools[t.id], I = await loadI18n(l), url = SITE + TOOL_PATH(l, t.id);
      const cat = data.cats?.[t.cat]?.[l] || data.cats?.[t.cat]?.en || t.cat;
      const rel = t.aff ? "sponsored nofollow noopener" : "noopener";
      const ul = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      const alt = (ALT[t.id] || []).map((id) => byId.get(id)).filter((x) => x && TD[l].tools?.[x.id]);
      const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(I.t("홈"))}</a> › <a href="${TOOL_HUB(l)}">${esc(L.crumb)}</a> › <span>${esc(t.name)}</span></nav>
    <h1 class="pg-title">${esc(t.name)}</h1>
    <p class="pg-desc">${esc(D.tag)}</p>
    <dl class="intro-info td-facts"><dt>${esc(L.maker)}</dt><dd>${esc(MAKER[t.id] || "")}</dd><dt>${esc(L.cat)}</dt><dd><a href="${TOOL_HUB(l)}">${esc(cat)}</a></dd></dl>
    <p><a class="btn${t.aff ? " btn--primary" : ""}" href="${esc(t.href)}" target="_blank" rel="${rel}" data-tool="${esc(t.id)}">${esc(L.go(t.name))}</a></p>
    ${t.aff ? `<p class="tl-disclose">${esc(L.disclose)}</p>` : ""}
    <section class="pg-sec"><h2>${esc(L.bestH)}</h2>${ul(D.best)}</section>
    <section class="pg-sec td-pc"><div><h2>${esc(L.prosH)}</h2>${ul(D.pros)}</div><div><h2>${esc(L.consH)}</h2>${ul(D.cons)}</div></section>
    <section class="pg-sec"><h2>${esc(L.tipsH)}</h2><ol>${D.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>
    <section class="pg-sec"><h2>${esc(L.priceH)}</h2><p>${esc(L.price)}</p></section>
    ${alt.length ? `<section class="pg-sec"><h2>${esc(L.altH)}</h2><div class="tl-grid">${alt.map((x) => `<article class="tl-card"><h3><a href="${TOOL_PATH(l, x.id)}">${esc(x.name)}</a></h3><p>${esc(TD[l].tools[x.id].tag)}</p><a class="btn" href="${TOOL_PATH(l, x.id)}">${esc(L.more)} →</a></article>`).join("")}</div></section>` : ""}
    <p class="muted small">${esc(L.note)}</p>
    <p class="pg-all"><a class="btn" href="${TOOL_HUB(l)}">${esc(L.all)} →</a> <a class="btn" href="${HOWTO_PATH(l)}">${esc(L.howto)} →</a> <a class="btn btn--primary" href="${HOME[l]}">${esc(L.watch)} →</a></p>`;
      const ld = [
        { "@context": "https://schema.org", "@type": "WebPage", name: L.title(t.name), url, inLanguage: HTML_LANG[l], description: L.desc(t.name, D.tag),
          about: { "@type": "SoftwareApplication", name: t.name, applicationCategory: "MultimediaApplication", operatingSystem: "Web", url: safeUrl(t.url), publisher: { "@type": "Organization", name: MAKER[t.id] || t.name } } },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: I.t("홈"), item: SITE + HOME[l] },
          { "@type": "ListItem", position: 2, name: L.crumb, item: SITE + TOOL_HUB(l) },
          { "@type": "ListItem", position: 3, name: t.name, item: url }] },
      ];
      const html = shell({ lang: l, title: pickTitle(l, L, t.name), desc: L.desc(t.name, D.tag), url, image: `${SITE}/og-image.jpg?v=3`, ogType: "article", ld, body, I, ver, head: alts });
      if (await writeIfChanged(resolve(PUB, TOOL_PATH(l, t.id).slice(1), "index.html"), html)) changed++;
      urls.push({ loc: url, alts: altXml });
    }
  }
  return { changed, urls };
}

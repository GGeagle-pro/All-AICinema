// "AI로 영화 만드는 법" 가이드 페이지 (7개 언어): /how-to/, /en/how-to/ …
//  - 글: howto-text.mjs, 도구 이름·주소: data/tools.json, 제휴 링크: site.json tools { id: { link, on } } (AI 도구 추천 페이지와 같은 설정)
//  - 제휴 링크는 rel="sponsored nofollow" + 고지 문구. seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HTML_LANG, HOME } from "./pages.mjs";
import { HOWTO, HOWTO_PATH } from "./howto-text.mjs";

const LANGS = ["ko", "en", "ja", "zh", "es", "vi", "ar"];
const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar" };
const TOOLS_PATH = (l) => (l === "ko" ? "/tools/" : `/${l}/tools/`);
const safeUrl = (u) => { try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildHowto({ PUB, SITE, loadI18n, ver }) {
  let data = { tools: [] }, site = {};
  try { data = JSON.parse(await readFile(resolve(PUB, "data/tools.json"), "utf8")); } catch {}
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  const conf = site.tools && typeof site.tools === "object" ? site.tools : {};
  const byId = new Map((data.tools || []).filter((x) => x && conf[x.id]?.on !== false).map((x) => {
    const aff = safeUrl(conf[x.id]?.link);
    return [x.id, { ...x, href: aff || safeUrl(x.url), aff: !!aff }];
  }));
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${HOWTO_PATH(l)}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/how-to/" />`;
  const altXml = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${HOWTO_PATH(l)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/how-to/"/>`;
  let changed = 0;
  for (const l of LANGS) {
    const T = HOWTO[l], I = await loadI18n(l), url = SITE + HOWTO_PATH(l);
    const used = T.steps.flatMap((s) => s.tools).map((id) => byId.get(id)).filter((x) => x?.href);
    const anyAff = used.some((x) => x.aff);
    const steps = T.steps.map((s, i) => {
      const tl = s.tools.map((id) => byId.get(id)).filter((x) => x?.href);
      return `<section class="pg-sec ht-step" id="step-${i + 1}"><h2><span class="ht-n">${i + 1}</span>${esc(s.h)}</h2><p>${esc(s.p)}</p>${tl.length ? `
      <p class="ht-tools"><b>${esc(T.toolsLabel)}</b> ${tl.map((x) => `<a class="ht-tool${x.aff ? " ht-tool--aff" : ""}" href="${esc(x.href)}" target="_blank" rel="${x.aff ? "sponsored nofollow noopener" : "noopener"}" data-tool="${esc(x.id)}">${esc(x.name)} ↗</a>`).join("")}</p>` : ""}</section>`;
    }).join("\n    ");
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(I.t("홈"))}</a> › <span>${esc(T.crumb)}</span></nav>
    <h1 class="pg-title">${esc(T.h1)}</h1>
    <p class="pg-desc">${esc(T.lead)}</p>
    ${anyAff ? `<p class="tl-disclose">${esc(T.disclose)}</p>` : ""}
    <ol class="ht-toc">${T.steps.map((s, i) => `<li><a href="#step-${i + 1}">${esc(s.h)}</a></li>`).join("")}</ol>
    ${steps}
    <section class="pg-sec"><h2>${esc(T.tipsH)}</h2><ul>${T.tips.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted">${esc(T.contact)}</p></section>
    <p class="pg-all"><a class="btn" href="${TOOLS_PATH(l)}">${esc(T.allTools)} →</a> <a class="btn btn--primary" href="${HOME[l]}">${esc(T.watch)} →</a></p>`;
    const ld = [
      { "@context": "https://schema.org", "@type": "HowTo", name: T.h1, description: T.desc, inLanguage: HTML_LANG[l], url,
        step: T.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.h, text: s.p, url: `${url}#step-${i + 1}` })),
        tool: [...new Set(used.map((x) => x.name))].map((n) => ({ "@type": "HowToTool", name: n })) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: I.t("홈"), item: SITE + HOME[l] }, { "@type": "ListItem", position: 2, name: T.crumb, item: url }] },
    ];
    const html = shell({ lang: l, title: `${T.title} | All AI-Cinema`, desc: T.desc, url, image: `${SITE}/og-image.jpg?v=3`, ogType: "article", ld, body, I, ver, head: alts });
    if (await writeIfChanged(resolve(PUB, HOWTO_PATH(l).slice(1), "index.html"), html)) changed++;
  }
  return { changed, urls: LANGS.map((l) => ({ loc: SITE + HOWTO_PATH(l), alts: altXml })) };
}

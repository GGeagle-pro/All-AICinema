// "AI로 영화 만들기 도구" 추천 페이지 (5개 언어): /tools/, /en/tools/, /ja/tools/, /zh/tools/, /es/tools/
//  - 내용: public/data/tools.json (도구 이름·분류·설명·공식 주소)
//  - 제휴 링크·숨기기: public/data/site.json 의 tools { id: { link, on } } (관리자 > 광고 설정 탭)
//  - 제휴 링크는 rel="sponsored nofollow" + 페이지 위에 고지 문구 (공정위 추천·보증 지침)
//  - seo.mjs 가 매 수집 때 호출

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HTML_LANG, HOME } from "./pages.mjs";

const PATH = { ko: "/tools/", en: "/en/tools/", ja: "/ja/tools/", zh: "/zh/tools/", es: "/es/tools/" };
const HREFLANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };
const safeUrl = (u) => { try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const TXT = {
  ko: { title: "AI로 영화 만들기 – 추천 AI 영상·음성·음악 도구", h1: "AI로 영화 만들기: 추천 도구 모음",
    lead: "All AI-Cinema에 올라오는 AI 영화·드라마는 이런 도구들로 만들어져요. 글·이미지로 장면을 만들고, 목소리와 음악을 입히고, 편집해서 완성하는 순서대로 정리했어요.",
    steps: ["이미지 도구로 인물·배경 콘셉트를 만들어요", "영상 도구로 장면(컷)을 만들어요", "목소리·음악을 입혀요", "편집 도구로 이어 붙이고 자막을 넣어요"],
    stepsTitle: "AI 영화 만드는 순서", go: "사이트 가기", disclose: "이 페이지의 일부 링크는 제휴 링크로, 링크를 통해 가입·구매하면 운영자가 수수료를 받을 수 있어요. 이용자가 내는 가격에는 영향이 없어요.",
    watch: "AI로 만든 영화 보러 가기", desc: "AI 영화·드라마를 만드는 데 쓰는 영상 생성, 목소리·더빙, 음악, 이미지, 편집 도구를 용도별로 정리한 추천 목록." },
  en: { title: "How to Make AI Movies – Best AI Video, Voice & Music Tools", h1: "Make movies with AI: recommended tools",
    lead: "The AI films and dramas on All AI-Cinema are made with tools like these. They're grouped in the order you'd use them: create scenes from text or images, add voices and music, then edit.",
    steps: ["Design characters and sets with an image tool", "Generate scenes (shots) with a video tool", "Add voices and music", "Edit, join shots and add captions"],
    stepsTitle: "The AI filmmaking workflow", go: "Visit site", disclose: "Some links on this page are affiliate links. If you sign up or buy through them, we may earn a commission at no extra cost to you.",
    watch: "Watch AI-made movies", desc: "A curated list of AI tools for making movies and dramas: video generation, voice and dubbing, music, images and editing." },
  ja: { title: "AIで映画を作る – おすすめAI動画・音声・音楽ツール", h1: "AIで映画を作る：おすすめツール",
    lead: "All AI-Cinemaに集まるAI映画・ドラマは、こうしたツールで作られています。テキストや画像からシーンを作り、声と音楽を付け、編集して仕上げる順にまとめました。",
    steps: ["画像ツールでキャラクターや背景を作る", "動画ツールでシーン(カット)を作る", "声と音楽を付ける", "編集ツールでつなぎ、字幕を入れる"],
    stepsTitle: "AI映画づくりの流れ", go: "サイトへ", disclose: "このページの一部のリンクはアフィリエイトリンクです。リンク経由で登録・購入すると運営者が手数料を受け取る場合がありますが、価格は変わりません。",
    watch: "AIで作られた映画を見る", desc: "AI映画・ドラマ制作に使える動画生成、音声・吹き替え、音楽、画像、編集ツールを用途別にまとめたおすすめリスト。" },
  zh: { title: "用AI拍电影 – 推荐AI视频、配音与音乐工具", h1: "用AI拍电影：推荐工具",
    lead: "All AI-Cinema 收录的AI电影和短剧，就是用这些工具制作的。按照使用顺序整理：用文字或图片生成镜头，加上配音与音乐，再剪辑成片。",
    steps: ["用图像工具设计角色与场景", "用视频工具生成镜头", "添加配音与音乐", "用剪辑工具拼接并加字幕"],
    stepsTitle: "AI电影制作流程", go: "访问网站", disclose: "本页部分链接为推广链接，通过链接注册或购买时，网站可能获得佣金，您的价格不受影响。",
    watch: "观看AI制作的电影", desc: "按用途整理的AI电影与短剧制作工具推荐：视频生成、配音、音乐、图像与剪辑。" },
  es: { title: "Cómo hacer películas con IA – Herramientas de video, voz y música", h1: "Haz películas con IA: herramientas recomendadas",
    lead: "Las películas y series con IA de All AI-Cinema se crean con herramientas como estas. Están ordenadas según el proceso: crear escenas a partir de texto o imágenes, añadir voces y música, y editar.",
    steps: ["Diseña personajes y escenarios con una herramienta de imágenes", "Genera escenas (planos) con una herramienta de video", "Añade voces y música", "Edita, une los planos y añade subtítulos"],
    stepsTitle: "El proceso de cine con IA", go: "Ir al sitio", disclose: "Algunos enlaces de esta página son de afiliado. Si te registras o compras a través de ellos, podemos recibir una comisión sin costo adicional para ti.",
    watch: "Ver películas hechas con IA", desc: "Lista seleccionada de herramientas de IA para hacer películas y series: video, voz y doblaje, música, imágenes y edición." },
};

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildTools({ PUB, SITE, loadI18n, ver }) {
  let data, site = {};
  try { data = JSON.parse(await readFile(resolve(PUB, "data/tools.json"), "utf8")); } catch { return { urls: [], changed: 0 }; }
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  const conf = site.tools && typeof site.tools === "object" ? site.tools : {};
  const tools = (data.tools || []).filter((x) => x && /^[a-z0-9-]{2,30}$/.test(x.id) && conf[x.id]?.on !== false).map((x) => {
    const aff = safeUrl(conf[x.id]?.link);
    return { ...x, href: aff || safeUrl(x.url), aff: !!aff };
  }).filter((x) => x.href);
  const anyAff = tools.some((x) => x.aff);
  const alternates = Object.keys(PATH).map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE}${PATH[l]}" />`).join("\n  ")
    + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/tools/" />`;
  let changed = 0;
  for (const lang of Object.keys(PATH)) {
    const I = await loadI18n(lang), T = TXT[lang], url = SITE + PATH[lang];
    const cats = Object.keys(data.cats || {});
    const sec = cats.map((c) => {
      const list = tools.filter((x) => x.cat === c);
      if (!list.length) return "";
      return `<section class="pg-sec"><h2>${esc(data.cats[c][lang] || c)}</h2><div class="tl-grid">${list.map((x) => `
        <article class="tl-card"><h3>${esc(x.name)}</h3><p>${esc(x.desc?.[lang] || x.desc?.en || "")}</p>
          <a class="btn${x.aff ? " btn--primary" : ""}" href="${esc(x.href)}" target="_blank" rel="${x.aff ? "sponsored nofollow noopener" : "noopener"}" data-tool="${esc(x.id)}">${esc(T.go)} ↗</a></article>`).join("")}</div></section>`;
    }).join("\n");
    const ld = [
      { "@context": "https://schema.org", "@type": "ItemList", name: T.h1, url, inLanguage: HTML_LANG[lang],
        itemListElement: tools.map((x, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "SoftwareApplication", name: x.name, applicationCategory: "MultimediaApplication", operatingSystem: "Web", url: safeUrl(x.url), description: x.desc?.[lang] || "" } })) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: I.t("홈"), item: SITE + HOME[lang] }, { "@type": "ListItem", position: 2, name: T.h1, item: url }] },
    ];
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(I.t("홈"))}</a> › <span>${esc(I.t("AI 제작 도구"))}</span></nav>
    <h1 class="pg-title">${esc(T.h1)}</h1>
    <p class="pg-desc">${esc(T.lead)}</p>
    ${anyAff ? `<p class="tl-disclose">${esc(T.disclose)}</p>` : ""}
    <section class="pg-sec"><h2>${esc(T.stepsTitle)}</h2><ol class="tl-steps">${T.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></section>
${sec}
    <p class="pg-all"><a class="btn btn--primary" href="${HOME[lang]}">${esc(T.watch)} →</a></p>`;
    const html = shell({ lang, title: `${T.title} | All AI-Cinema`, desc: T.desc, url, image: `${SITE}/og-image.jpg?v=3`, ogType: "article", ld, body, I, ver, head: alternates });
    if (await writeIfChanged(resolve(PUB, PATH[lang].slice(1), "index.html"), html)) changed++;
  }
  return { changed, urls: Object.keys(PATH).map((l) => ({ loc: SITE + PATH[l], alts: alternates })) };
}

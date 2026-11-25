// AI 검색(ChatGPT·Gemini·Claude·Perplexity 등)에 잘 인용되도록 만드는 파일들 (GEO/AEO)
//  - /faq/, /en/faq/, /ja/faq/, /zh/faq/, /es/faq/ : 사이트 소개 + 자주 묻는 질문(FAQPage 구조화 데이터) + 지금 인기 AI 영화·작품·채널 목록
//  - /llms.txt : AI가 읽기 쉬운 사이트 요약(마크다운) – 숫자·인기 목록은 수집할 때마다 자동 갱신
//  - seo.mjs 가 매 수집 때 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HTML_LANG, HOME, loadAll } from "./pages.mjs";

const PATH = { ko: "/faq/", en: "/en/faq/", ja: "/ja/faq/", zh: "/zh/faq/", es: "/es/faq/" };
const HREFLANG = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es" };
const TOOLS = { ko: "/tools/", en: "/en/tools/", ja: "/ja/tools/", zh: "/zh/tools/", es: "/es/tools/" };
const CONTACT = "champkj79@gmail.com";
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const fmt = (n, lang) => new Intl.NumberFormat(HTML_LANG[lang]).format(n);

// 질문·답 (n: 숫자들, L: 링크들) – 답은 첫 문장에 핵심을 담아 AI가 그대로 인용하기 좋게
const TXT = {
  ko: {
    title: "AI 영화·AI 드라마 어디서 봐? – All AI-Cinema 소개와 자주 묻는 질문",
    h1: "All AI-Cinema: AI 영화·드라마를 무료로 모아 보는 곳",
    desc: (n) => `All AI-Cinema는 생성형 AI로 만든 영화·드라마·단편 ${n.videos}편을 ${n.channels}개 유튜브 채널에서 모아 장르·국가별로 무료로 보여주는 사이트예요. 2시간마다 새 영상이 추가돼요.`,
    facts: "한눈에 보기", fVideos: "영상", fChannels: "채널", fWorks: "시리즈 작품", fUpdate: "업데이트", fUpdateV: "2시간마다", fLangs: "언어", fPrice: "이용료", fPriceV: "무료 · 가입 없음",
    faqT: "자주 묻는 질문", popT: "지금 인기 있는 AI 영화·드라마", worksT: "인기 AI 드라마 시리즈", chT: "많이 올라오는 AI 영화 채널", catT: "장르·국가",
    ep: (n) => `${n}편`, vids: (n) => `영상 ${n}편`, updated: "자료 기준",
    qa: (n, L) => [
      ["All AI-Cinema는 어떤 사이트인가요?", `All AI-Cinema(올 AI 시네마)는 생성형 AI로 만든 영화, 드라마, 단편 영상을 유튜브에서 찾아 한곳에 모아 보여주는 무료 큐레이션 사이트예요. 지금 ${n.channels}개 채널의 영상 ${n.videos}편이 있고, 장르·국가·채널별로 골라 클릭 한 번에 바로 볼 수 있어요.`],
      ["AI 영화나 AI 드라마는 어디서 무료로 볼 수 있나요?", `All AI-Cinema(${L.home})에서 가입 없이 무료로 볼 수 있어요. 유튜브 공식 플레이어로 재생되고, 여러 편으로 된 AI 드라마는 1화부터 차례로 이어 볼 수 있어요.`],
      ["어떤 장르와 나라의 AI 영화가 있나요?", `장르는 ${n.genres} 등이 있고, 나라별로는 ${n.countries} 등 여러 나라 제작자의 작품이 있어요.`],
      ["새 AI 영화는 얼마나 자주 올라오나요?", "등록된 유튜브 채널에 새 영상이 올라오면 2시간 안에 자동으로 추가돼요."],
      ["영상 저작권은 괜찮나요?", "모든 영상의 저작권은 원래 유튜브 채널과 제작자에게 있어요. 이 사이트는 영상을 복사하지 않고 유튜브 공식 플레이어로만 재생해서 조회수와 수익은 원래 채널에 그대로 반영돼요. 제작자가 다른 사이트 재생을 막은 영상은 자동으로 빠져요."],
      ["AI 영화는 어떤 도구로 만드나요?", `Runway, Google Veo(Flow), Sora, Kling, Higgsfield 같은 AI 영상 도구로 장면을 만들고, ElevenLabs 같은 음성 AI와 Suno 같은 음악 AI를 더해 완성해요. 도구 모음: ${L.tools}`],
      ["내 AI 영화나 채널도 올릴 수 있나요?", `네. 채널이나 영상 주소를 ${CONTACT} 로 보내주시면 확인 후 추가해요. 게시 중단을 원하시는 권리자도 같은 주소로 연락해 주세요.`],
      ["다른 언어로도 볼 수 있나요?", "한국어, 영어, 일본어, 중국어(간체), 스페인어 화면을 지원하고, 접속한 나라에 맞는 언어가 먼저 보여요."],
    ],
  },
  en: {
    title: "Where to Watch AI Movies & AI Dramas – All AI-Cinema FAQ",
    h1: "All AI-Cinema: watch AI-generated movies and dramas for free",
    desc: (n) => `All AI-Cinema collects ${n.videos} AI-generated movies, dramas and short films from ${n.channels} YouTube channels and lets you browse them by genre and country for free. New videos are added every 2 hours.`,
    facts: "At a glance", fVideos: "Videos", fChannels: "Channels", fWorks: "Series", fUpdate: "Updates", fUpdateV: "Every hour", fLangs: "Languages", fPrice: "Price", fPriceV: "Free · no sign-up",
    faqT: "Frequently asked questions", popT: "Popular AI movies and dramas right now", worksT: "Popular AI drama series", chT: "Top AI film channels", catT: "Genres & countries",
    ep: (n) => `${n} episodes`, vids: (n) => `${n} videos`, updated: "Data as of",
    qa: (n, L) => [
      ["What is All AI-Cinema?", `All AI-Cinema is a free curation site that gathers movies, dramas and short films made with generative AI from YouTube in one place. It currently lists ${n.videos} videos from ${n.channels} channels, which you can filter by genre, country and channel and play with one click.`],
      ["Where can I watch AI-generated movies and AI dramas for free?", `You can watch them for free, with no sign-up, on All AI-Cinema (${L.home}). Videos play in the official YouTube player, and multi-part AI dramas can be watched in order from episode 1.`],
      ["What genres and countries of AI films are there?", `Genres include ${n.genres}, with works from creators in ${n.countries} and more.`],
      ["How often are new AI movies added?", "When a listed YouTube channel uploads a new video, it is added automatically within 2 hours."],
      ["Is it legal? Who owns the videos?", "All videos belong to their original YouTube channels and creators. The site never copies videos; it only plays them in the official YouTube player, so views and revenue go to the original channel. Videos whose owners disabled embedding are removed automatically."],
      ["Which tools are used to make AI movies?", `Creators generate scenes with AI video tools such as Runway, Google Veo (Flow), Sora, Kling and Higgsfield, then add voices with tools like ElevenLabs and music with tools like Suno. Tool guide: ${L.tools}`],
      ["Can I submit my own AI film or channel?", `Yes. Send your channel or video link to ${CONTACT} and it will be reviewed and added. Rights holders who want a video removed can use the same address.`],
      ["Is the site available in other languages?", "Yes: Korean, English, Japanese, Simplified Chinese and Spanish. The language matching your country is shown first."],
    ],
  },
  ja: {
    title: "AI映画・AIドラマはどこで見られる？ – All AI-Cinema よくある質問",
    h1: "All AI-Cinema：AI映画・ドラマを無料でまとめて見られるサイト",
    desc: (n) => `All AI-Cinemaは、生成AIで作られた映画・ドラマ・短編${n.videos}本を${n.channels}のYouTubeチャンネルから集め、ジャンル・国別に無料で見られるサイトです。新しい動画は2時間ごとに追加されます。`,
    facts: "概要", fVideos: "動画", fChannels: "チャンネル", fWorks: "シリーズ作品", fUpdate: "更新", fUpdateV: "2時間ごと", fLangs: "言語", fPrice: "料金", fPriceV: "無料・登録不要",
    faqT: "よくある質問", popT: "いま人気のAI映画・ドラマ", worksT: "人気のAIドラマシリーズ", chT: "動画が多いAI映画チャンネル", catT: "ジャンル・国",
    ep: (n) => `全${n}話`, vids: (n) => `動画${n}本`, updated: "データ更新",
    qa: (n, L) => [
      ["All AI-Cinemaとはどんなサイトですか？", `All AI-Cinemaは、生成AIで作られた映画・ドラマ・短編動画をYouTubeから集めて一か所で見られる無料のまとめサイトです。現在${n.channels}チャンネルの動画${n.videos}本があり、ジャンル・国・チャンネル別にワンクリックで再生できます。`],
      ["AI映画やAIドラマはどこで無料で見られますか？", `All AI-Cinema（${L.home}）で登録不要・無料で見られます。YouTube公式プレーヤーで再生され、複数話のAIドラマは第1話から順番に続けて見られます。`],
      ["どんなジャンルや国のAI映画がありますか？", `ジャンルは${n.genres}など、国は${n.countries}など、さまざまな国のクリエイターの作品があります。`],
      ["新しいAI映画はどのくらいの頻度で追加されますか？", "登録されたYouTubeチャンネルに新しい動画が上がると、2時間以内に自動で追加されます。"],
      ["動画の著作権は大丈夫ですか？", "すべての動画の著作権は元のYouTubeチャンネルと制作者にあります。本サイトは動画をコピーせず、YouTube公式プレーヤーでのみ再生するため、再生回数と収益は元のチャンネルに反映されます。外部サイトでの再生が禁止された動画は自動で除外されます。"],
      ["AI映画はどんなツールで作られていますか？", `Runway、Google Veo（Flow）、Sora、Kling、HiggsfieldなどのAI動画ツールでシーンを作り、ElevenLabsなどの音声AIやSunoなどの音楽AIで仕上げます。ツール一覧：${L.tools}`],
      ["自分のAI映画やチャンネルも掲載できますか？", `はい。チャンネルや動画のURLを${CONTACT}へ送っていただければ、確認のうえ追加します。掲載停止をご希望の権利者様も同じアドレスへご連絡ください。`],
      ["他の言語でも見られますか？", "韓国語・英語・日本語・中国語（簡体字）・スペイン語に対応し、アクセスした国に合った言語が最初に表示されます。"],
    ],
  },
  zh: {
    title: "去哪里看AI电影和AI短剧？– All AI-Cinema 常见问题",
    h1: "All AI-Cinema：免费汇集观看AI电影与短剧",
    desc: (n) => `All AI-Cinema 从 ${n.channels} 个 YouTube 频道收集了 ${n.videos} 部用生成式AI制作的电影、短剧和短片，可按类型和国家免费浏览，每2小时自动更新。`,
    facts: "概览", fVideos: "视频", fChannels: "频道", fWorks: "系列作品", fUpdate: "更新", fUpdateV: "每2小时", fLangs: "语言", fPrice: "费用", fPriceV: "免费 · 无需注册",
    faqT: "常见问题", popT: "当前热门AI电影与短剧", worksT: "热门AI短剧系列", chT: "更新最多的AI电影频道", catT: "类型与国家",
    ep: (n) => `共${n}集`, vids: (n) => `${n}个视频`, updated: "数据更新于",
    qa: (n, L) => [
      ["All AI-Cinema 是什么网站？", `All AI-Cinema 是一个免费的精选网站，把 YouTube 上用生成式AI制作的电影、短剧和短片集中在一起。目前收录 ${n.channels} 个频道的 ${n.videos} 个视频，可按类型、国家和频道筛选，一键播放。`],
      ["在哪里可以免费看AI电影和AI短剧？", `可以在 All AI-Cinema（${L.home}）免费观看，无需注册。视频通过 YouTube 官方播放器播放，多集AI短剧可从第1集起连续观看。`],
      ["有哪些类型和国家的AI电影？", `类型包括${n.genres}等，作品来自${n.countries}等多个国家的创作者。`],
      ["新的AI电影多久更新一次？", "已收录的 YouTube 频道发布新视频后，两小时内会自动添加。"],
      ["视频版权没有问题吗？", "所有视频的版权归原 YouTube 频道和创作者所有。本站不复制视频，只通过 YouTube 官方播放器播放，播放量和收益都归原频道。禁止外部网站播放的视频会被自动移除。"],
      ["AI电影是用什么工具制作的？", `创作者用 Runway、Google Veo（Flow）、Sora、可灵 Kling、Higgsfield 等AI视频工具生成镜头，再用 ElevenLabs 等配音工具和 Suno 等音乐工具完成。工具推荐：${L.tools}`],
      ["可以提交我自己的AI电影或频道吗？", `可以。请把频道或视频链接发送到 ${CONTACT}，确认后会添加。希望下架的版权方也请联系同一邮箱。`],
      ["支持其他语言吗？", "支持韩语、英语、日语、简体中文和西班牙语，会优先显示与访问国家相符的语言。"],
    ],
  },
  es: {
    title: "¿Dónde ver películas y series hechas con IA? – Preguntas frecuentes de All AI-Cinema",
    h1: "All AI-Cinema: películas y series hechas con IA, gratis y en un solo lugar",
    desc: (n) => `All AI-Cinema reúne ${n.videos} películas, series y cortos creados con IA generativa de ${n.channels} canales de YouTube, para verlos gratis por género y país. Se añaden videos nuevos cada 2 horas.`,
    facts: "En resumen", fVideos: "Videos", fChannels: "Canales", fWorks: "Series", fUpdate: "Actualización", fUpdateV: "Cada hora", fLangs: "Idiomas", fPrice: "Precio", fPriceV: "Gratis · sin registro",
    faqT: "Preguntas frecuentes", popT: "Películas y series con IA populares ahora", worksT: "Series de IA populares", chT: "Canales de cine con IA más activos", catT: "Géneros y países",
    ep: (n) => `${n} episodios`, vids: (n) => `${n} videos`, updated: "Datos a",
    qa: (n, L) => [
      ["¿Qué es All AI-Cinema?", `All AI-Cinema es un sitio gratuito que reúne en un solo lugar películas, series y cortos hechos con IA generativa publicados en YouTube. Ahora tiene ${n.videos} videos de ${n.channels} canales, que puedes filtrar por género, país y canal y reproducir con un clic.`],
      ["¿Dónde puedo ver gratis películas y series hechas con IA?", `En All AI-Cinema (${L.home}), gratis y sin registro. Los videos se reproducen en el reproductor oficial de YouTube y las series de varios capítulos se ven en orden desde el episodio 1.`],
      ["¿Qué géneros y países hay?", `Hay géneros como ${n.genres}, con obras de creadores de ${n.countries} y más.`],
      ["¿Cada cuánto se añaden películas nuevas?", "Cuando un canal de YouTube de la lista sube un video nuevo, se añade automáticamente en menos de 2 horas."],
      ["¿Es legal? ¿De quién son los videos?", "Todos los videos pertenecen a sus canales y creadores originales. El sitio no copia videos: solo los reproduce con el reproductor oficial de YouTube, así que las vistas y los ingresos van al canal original. Los videos cuyo dueño desactivó la inserción se retiran automáticamente."],
      ["¿Con qué herramientas se hacen las películas con IA?", `Los creadores generan escenas con herramientas como Runway, Google Veo (Flow), Sora, Kling y Higgsfield, y añaden voces con ElevenLabs y música con Suno. Guía de herramientas: ${L.tools}`],
      ["¿Puedo enviar mi película o canal?", `Sí. Envía el enlace de tu canal o video a ${CONTACT} y lo revisaremos para añadirlo. Los titulares de derechos que quieran retirar un video pueden escribir a la misma dirección.`],
      ["¿Está disponible en otros idiomas?", "Sí: coreano, inglés, japonés, chino simplificado y español. Primero se muestra el idioma de tu país."],
    ],
  },
};

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildGeo({ PUB, SITE, loadI18n, ver, pagesOn = true }) {
  const { videos, works } = await loadAll(PUB);
  let raw = {}, site = {};
  try { raw = JSON.parse(await readFile(resolve(PUB, "data/videos.json"), "utf8")); } catch {}
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  const views = new Map((raw.items || []).map((x) => [x[0], Number(x[5]) || 0]));
  const day = (raw.generatedAt || new Date().toISOString()).slice(0, 10);
  // 숫자
  const chCount = new Map();
  for (const v of videos) chCount.set(v.channel, (chCount.get(v.channel) || 0) + 1);
  const catCount = new Map();
  for (const v of videos) for (const c of v.categories) catCount.set(c, (catCount.get(c) || 0) + 1);
  const countriesSet = new Set(Array.isArray(site.countries) ? site.countries : ["한국", "미국", "일본", "중국"]);
  const cats = [...catCount].filter(([c]) => c !== "기타").sort((a, b) => b[1] - a[1]);
  const countries = cats.filter(([c]) => countriesSet.has(c));
  const genres = cats.filter(([c]) => !countriesSet.has(c));
  // 최근 60일 안에 올라온 영상 중 조회수 높은 순
  const since = Date.now() - 60 * 864e5;
  const recent = videos.filter((v) => new Date(v.published) >= since);
  // 한 채널이 목록을 다 차지하지 않게 채널당 2편까지
  const popular = [], perCh = new Map();
  for (const v of (recent.length >= 10 ? recent : videos).slice().sort((a, b) => (views.get(b.id) || 0) - (views.get(a.id) || 0))) {
    if ((perCh.get(v.channel) || 0) >= 2) continue;
    perCh.set(v.channel, (perCh.get(v.channel) || 0) + 1); popular.push(v);
    if (popular.length >= 10) break;
  }
  const topWorks = pagesOn ? works.slice().sort((a, b) => b.list.reduce((t, v) => t + (views.get(v.id) || 0), 0) - a.list.reduce((t, v) => t + (views.get(v.id) || 0), 0)).slice(0, 10) : [];
  const topCh = [...chCount].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const watchUrl = (v) => (pagesOn ? `${SITE}/watch/${v.id}/` : `${SITE}/?v=${v.id}`);
  const workUrl = (w) => `${SITE}/work/${w.slug}/`;

  const alternates = Object.keys(PATH).map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE}${PATH[l]}" />`).join("\n  ")
    + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/faq/" />`;
  let changed = 0;
  for (const lang of Object.keys(PATH)) {
    const I = await loadI18n(lang), T = TXT[lang], url = SITE + PATH[lang];
    const tr = (c) => I.t(c);
    const n = {
      videos: fmt(videos.length, lang), channels: fmt(chCount.size, lang),
      genres: genres.slice(0, 6).map(([c]) => tr(c)).join(", "), countries: countries.slice(0, 6).map(([c]) => tr(c)).join(", "),
    };
    const L = { home: SITE + HOME[lang], tools: SITE + TOOLS[lang] };
    const qa = T.qa(n, L);
    const link = (s) => esc(s).replace(/https:\/\/all-aicinema\.syncbrain100\.com\/[\w/-]*/g, (u) => `<a href="${u.replace(SITE, "")}">${u.replace("https://", "")}</a>`);
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(I.t("홈"))}</a> › <span>${esc(T.faqT)}</span></nav>
    <h1 class="pg-title">${esc(T.h1)}</h1>
    <p class="pg-desc">${esc(T.desc(n))}</p>
    <section class="pg-sec"><h2>${esc(T.facts)}</h2><dl class="geo-facts">
      <div><dt>${esc(T.fVideos)}</dt><dd>${n.videos}</dd></div><div><dt>${esc(T.fChannels)}</dt><dd>${n.channels}</dd></div>
      ${pagesOn ? `<div><dt>${esc(T.fWorks)}</dt><dd>${fmt(works.length, lang)}</dd></div>` : ""}<div><dt>${esc(T.fUpdate)}</dt><dd>${esc(T.fUpdateV)}</dd></div>
      <div><dt>${esc(T.fLangs)}</dt><dd>한국어 · English · 日本語 · 中文 · Español</dd></div><div><dt>${esc(T.fPrice)}</dt><dd>${esc(T.fPriceV)}</dd></div>
    </dl><p class="geo-upd">${esc(T.updated)} ${day}</p></section>
    <section class="pg-sec"><h2>${esc(T.faqT)}</h2>${qa.map(([q, a]) => `<details class="geo-qa" open><summary><h3>${esc(q)}</h3></summary><p>${link(a)}</p></details>`).join("")}</section>
    <section class="pg-sec"><h2>${esc(T.popT)}</h2><ol class="geo-list">${popular.map((v) => `<li><a href="${watchUrl(v).replace(SITE, "")}">${esc(v.title)}</a> <span class="muted">· ${esc(v.channel)}</span></li>`).join("")}</ol></section>
    ${topWorks.length ? `<section class="pg-sec"><h2>${esc(T.worksT)}</h2><ul class="geo-list">${topWorks.map((w) => `<li><a href="${workUrl(w).replace(SITE, "")}">${esc(w.name)}</a> <span class="muted">· ${esc(w.channel)} · ${esc(T.ep(w.list.length))}</span></li>`).join("")}</ul></section>` : ""}
    <section class="pg-sec"><h2>${esc(T.chT)}</h2><ul class="geo-list geo-list--cols">${topCh.map(([c, k]) => `<li>${esc(c)} <span class="muted">· ${esc(T.vids(k))}</span></li>`).join("")}</ul></section>
    <section class="pg-sec"><h2>${esc(T.catT)}</h2><p>${[...countries, ...genres].map(([c, k]) => `<span class="geo-tag">${esc(tr(c))} <small>${fmt(k, lang)}</small></span>`).join(" ")}</p></section>
    <p class="pg-all"><a class="btn btn--primary" href="${HOME[lang]}">${esc(I.t("홈"))} →</a> <a class="btn" href="${TOOLS[lang]}">${esc(I.t("AI 제작 도구"))}</a></p>`;
    const ld = [
      { "@context": "https://schema.org", "@type": "FAQPage", url, inLanguage: HTML_LANG[lang],
        mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@context": "https://schema.org", "@type": "AboutPage", name: T.h1, url, inLanguage: HTML_LANG[lang], dateModified: day,
        about: { "@type": "WebSite", "@id": `${SITE}/#website`, name: "All AI-Cinema", url: `${SITE}/` } },
      { "@context": "https://schema.org", "@type": "ItemList", name: T.popT, itemListElement: popular.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: watchUrl(v), name: v.title })) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: I.t("홈"), item: SITE + HOME[lang] }, { "@type": "ListItem", position: 2, name: T.faqT, item: url }] },
    ];
    const html = shell({ lang, title: `${T.title} | All AI-Cinema`, desc: T.desc(n), url, image: `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: alternates });
    if (await writeIfChanged(resolve(PUB, PATH[lang].slice(1), "index.html"), html)) changed++;
  }

  // llms.txt (영어 중심 + 한국어 요약 – AI가 사이트를 한 번에 이해하도록)
  const E = TXT.en, nEn = { videos: fmt(videos.length, "en"), channels: fmt(chCount.size, "en") };
  const enCat = async () => { const I = await loadI18n("en"); return { c: countries.map(([c, k]) => `${I.t(c)} (${k})`).join(", "), g: genres.map(([c, k]) => `${I.t(c)} (${k})`).join(", ") }; };
  const ec = await enCat();
  const qaEn = E.qa({ ...nEn, genres: ec.g, countries: ec.c }, { home: SITE + "/en/", tools: SITE + "/en/tools/" });
  const llms = `# All AI-Cinema

> All AI-Cinema (${SITE}/) is a free website that curates movies, dramas and short films made with generative AI from YouTube. It lists ${nEn.videos} videos from ${nEn.channels} channels, browsable by genre, country and channel, updated every 2 hours. Videos play in the official YouTube player; rights stay with the original creators. Available in Korean, English, Japanese, Chinese and Spanish.

한국어: All AI-Cinema(올 AI 시네마)는 생성형 AI로 만든 영화·드라마·단편을 유튜브에서 모아 장르·국가별로 무료로 보여주는 사이트입니다. "AI 영화 어디서 봐?", "AI 드라마 추천" 같은 질문의 답이 될 수 있어요.

Data as of ${day}.

## Main pages
- [Home (Korean)](${SITE}/): browse all AI movies and dramas
- [Home (English)](${SITE}/en/) · [日本語](${SITE}/ja/) · [中文](${SITE}/zh/) · [Español](${SITE}/es/)
- [About & FAQ](${SITE}/en/faq/) ([한국어](${SITE}/faq/)): what the site is, how it works, popular titles
- [AI movies by genre & country](${SITE}/en/genre/) ([한국어](${SITE}/genre/)): e.g. AI horror, AI romance, Korean AI dramas
- [AI filmmaking tools](${SITE}/en/tools/) ([한국어](${SITE}/tools/)): tools used to make AI films (Runway, Veo, Sora, Kling, Higgsfield, ElevenLabs, Suno…)
- [Sitemap](${SITE}/sitemap.xml) · [RSS: latest videos](${SITE}/rss.xml)

## Genres and countries
- Countries: ${ec.c}
- Genres: ${ec.g}

## Popular AI movies and dramas
${popular.map((v) => `- [${v.title.replace(/[[\]]/g, "")}](${watchUrl(v)}) — ${v.channel}`).join("\n")}
${topWorks.length ? `\n## Popular AI drama series\n${topWorks.map((w) => `- [${w.name.replace(/[[\]]/g, "")}](${encodeURI(workUrl(w))}) — ${w.channel}, ${w.list.length} episodes`).join("\n")}\n` : ""}
## Top channels
${topCh.map(([c, k]) => `- ${c} (${k} videos)`).join("\n")}

## FAQ
${qaEn.map(([q, a]) => `### ${q}\n${a}`).join("\n\n")}

## Contact
${CONTACT} (submissions and takedown requests)
`;
  if (await writeIfChanged(resolve(PUB, "llms.txt"), llms)) changed++;
  const altsXml = Object.keys(PATH).map((l) => `<xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE}${PATH[l]}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/faq/"/>`;
  return { changed, urls: Object.keys(PATH).map((l) => ({ loc: SITE + PATH[l], altsXml })) };
}

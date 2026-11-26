// 장르·나라별 모음 페이지 (5개 언어) – "AI 공포 영화", "한국 AI 드라마" 같은 넓은 검색어용
//  - /genre/ (모음 목록), /genre/horror/, /en/genre/horror/ …
//  - 글은 모은 데이터로 자동 작성: 편수·채널·시리즈 수, 많이 올리는 채널, 인기 시리즈·영상, 최신 영상, 자주 묻는 질문
//  - 끄기(원상 복구): 관리자 > 작품 탭 "장르별 모음 페이지" → site.json genrePages:false → 다음 수집 때 페이지 삭제
//  - seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, HTML_LANG, HOME, loadAll } from "./pages.mjs";

const LANGS = ["ko", "en", "ja", "zh", "es", "vi", "ar"];
const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar" };
const BASE = { ko: "/genre/", en: "/en/genre/", ja: "/ja/genre/", zh: "/zh/genre/", es: "/es/genre/", vi: "/vi/genre/", ar: "/ar/genre/" };
// 주소 이름 (바꾸면 검색엔진에 쌓인 주소가 바뀌므로 그대로 둘 것)
export const GENRE_SLUG = {
  "드라마": "drama", "판타지": "fantasy", "액션·히어로": "action", "로맨스": "romance", "사극·무협": "historical",
  "SF": "sf", "공포": "horror", "미스터리·스릴러": "mystery", "코미디": "comedy", "애니메이션": "animation",
  "한국": "korea", "미국": "usa", "일본": "japan", "중국": "china", "스페인": "spain", "영국": "uk", "프랑스": "france", "대만": "taiwan",
};
const MIN = 12;   // 이보다 적으면 페이지를 만들지 않음 (내용이 얇은 페이지 방지)

const floorN = (n) => (n >= 1000 ? Math.floor(n / 100) * 100 : n >= 100 ? Math.floor(n / 10) * 10 : n);
const fmt = (n, l) => new Intl.NumberFormat(HTML_LANG[l]).format(n);
const compact = (n, l) => new Intl.NumberFormat(HTML_LANG[l], { notation: "compact", maximumFractionDigits: 1 }).format(n);
const list = (arr, l) => { try { return new Intl.ListFormat(HTML_LANG[l], { type: "conjunction" }).format(arr); } catch { return arr.join(", "); } };

// 언어별 문구 (g: 장르 이름, country: 나라 페이지인지)
const TX = {
  ko: {
    h: (g, c) => (c ? `${g} AI 영화·드라마 모음` : `AI ${g} 영화·드라마 추천 모음`),
    t: (g, c) => (c ? `${g} AI 영화·드라마·단편 모음` : `AI ${g} 영화·드라마 추천 – 무료로 모아보기`),
    intro: (g, c, s) => `유튜브에 올라온 ${c ? g + "의 " : g + " 장르의 "}AI 영화·드라마·단편 ${s.n}편${s.more ? " 이상" : ""}을 모았어요. ${s.ch}개 채널${s.w ? `, ${s.w}개 시리즈` : ""}가 있고, 가장 많이 올리는 채널은 ${s.top}예요. 최근 30일 동안 ${s.n30}편이 새로 올라왔고, 2시간마다 새 영상이 자동으로 추가돼요.`,
    works: "인기 시리즈", eps: (n) => `${n}화`, pop: "많이 본 영상", fresh: "최근 올라온 영상", other: "다른 장르·나라", views: "조회수",
    all: (g) => `사이트에서 ${g} 전체 보기`, home: "홈", hub: "장르별 모음", hubT: "AI 영화·드라마 장르별 모음", hubD: "AI로 만든 영화·드라마·단편을 장르와 나라별로 모았어요. 장르를 누르면 인기 시리즈와 최신 영상을 볼 수 있어요.",
    genres: "장르", countries: "나라", count: (n) => `${n}편`,
    faq: "자주 묻는 질문",
    q1: (g) => `AI ${g} 영화는 어디서 무료로 볼 수 있나요?`, a1: (g) => `All AI-Cinema에서 유튜브에 공개된 AI ${g} 작품을 무료로 모아 볼 수 있어요. 영상은 유튜브 플레이어로 재생되고, 회원가입이 필요 없어요.`,
    q2: (g) => `가장 인기 있는 AI ${g} 작품은 무엇인가요?`, a2: (v, w) => `지금 조회수가 가장 많은 영상은 「${v.title}」(${v.channel})예요.${w ? ` 인기 시리즈로는 「${w.name}」(${w.channel}, ${w.list.length}화)이 있어요.` : ""}`,
    q3: () => "새 작품은 얼마나 자주 올라오나요?", a3: (s) => `최근 30일 동안 ${s.n30}편이 새로 올라왔어요. 사이트는 2시간마다 등록된 유튜브 채널을 확인해 새 영상을 자동으로 추가해요.`,
  },
  en: {
    h: (g, c) => (c ? `AI Movies & Series from ${g}` : `AI ${g} Movies & Series`),
    t: (g, c) => (c ? `AI Movies, Series & Shorts from ${g}` : `Best AI ${g} Movies & Series – Watch Free`),
    intro: (g, c, s) => `${s.more ? "Over " : ""}${s.n} AI-made ${c ? "movies, series and short films from " + g : g + " movies, series and short films"} from YouTube, in one place. They come from ${s.ch} channels${s.w ? ` and ${s.w} series` : ""}; the most active ${s.topN > 1 ? "channels are" : "channel is"} ${s.top}. ${s.n30} new videos were added in the last 30 days, and new ones are added automatically every 2 hours.`,
    works: "Popular series", eps: (n) => `${n} episodes`, pop: "Most watched", fresh: "Recently added", other: "Other genres & countries", views: "views",
    all: (g) => `Browse all ${g} on the site`, home: "Home", hub: "Genres", hubT: "AI Movies & Series by Genre", hubD: "AI-made movies, series and short films sorted by genre and country. Pick one to see popular series and the latest videos.",
    genres: "Genres", countries: "Countries", count: (n) => `${n} videos`,
    faq: "FAQ",
    q1: (g) => `Where can I watch AI ${g} movies for free?`, a1: (g) => `All AI-Cinema collects AI ${g} titles published on YouTube so you can watch them free in one place. Videos play in the YouTube player and no sign-up is needed.`,
    q2: (g) => `What are the most popular AI ${g} titles?`, a2: (v, w) => `The most-viewed video right now is "${v.title}" by ${v.channel}.${w ? ` A popular series is "${w.name}" by ${w.channel} (${w.list.length} episodes).` : ""}`,
    q3: () => "How often are new titles added?", a3: (s) => `${s.n30} new videos were added in the last 30 days. The site checks its YouTube channels every 2 hours and adds new videos automatically.`,
  },
  ja: {
    h: (g, c) => (c ? `${g}のAI映画・ドラマまとめ` : `AI${g}映画・ドラマまとめ`),
    t: (g, c) => (c ? `${g}のAI映画・ドラマ・短編まとめ` : `おすすめAI${g}映画・ドラマ – 無料でまとめて見る`),
    intro: (g, c, s) => `YouTubeに公開された${c ? g + "の" : g + "ジャンルの"}AI映画・ドラマ・短編${s.n}本${s.more ? "以上" : ""}をまとめました。${s.ch}チャンネル${s.w ? `・${s.w}シリーズ` : ""}があり、最も多く投稿しているのは${s.top}です。最近30日で${s.n30}本が追加され、2時間ごとに新しい動画が自動で追加されます。`,
    works: "人気シリーズ", eps: (n) => `全${n}話`, pop: "よく見られている動画", fresh: "最近追加された動画", other: "ほかのジャンル・国", views: "回視聴",
    all: (g) => `サイトで${g}をすべて見る`, home: "ホーム", hub: "ジャンル別", hubT: "AI映画・ドラマ ジャンル別まとめ", hubD: "AIで作られた映画・ドラマ・短編をジャンルと国別にまとめました。選ぶと人気シリーズと最新動画が見られます。",
    genres: "ジャンル", countries: "国", count: (n) => `${n}本`,
    faq: "よくある質問",
    q1: (g) => `AI${g}映画はどこで無料で見られますか？`, a1: (g) => `All AI-CinemaでYouTubeに公開されたAI${g}作品を無料でまとめて見られます。動画はYouTubeプレーヤーで再生され、会員登録は不要です。`,
    q2: (g) => `一番人気のAI${g}作品は？`, a2: (v, w) => `現在いちばん再生されている動画は「${v.title}」（${v.channel}）です。${w ? `人気シリーズには「${w.name}」（${w.channel}・全${w.list.length}話）があります。` : ""}`,
    q3: () => "新しい作品はどのくらいの頻度で追加されますか？", a3: (s) => `最近30日で${s.n30}本が追加されました。サイトは2時間ごとに登録チャンネルを確認し、新しい動画を自動で追加します。`,
  },
  zh: {
    h: (g, c) => (c ? `${g}AI电影与短剧合集` : `AI${g}电影与短剧合集`),
    t: (g, c) => (c ? `${g}AI电影、短剧与短片合集` : `AI${g}电影与短剧推荐 – 免费观看`),
    intro: (g, c, s) => `这里汇集了YouTube上${c ? g + "的" : g + "类"}AI电影、短剧和短片共${s.n}部${s.more ? "以上" : ""}，来自${s.ch}个频道${s.w ? `、${s.w}个系列` : ""}，发布最多的是${s.top}。最近30天新增${s.n30}部，网站每2小时自动添加新视频。`,
    works: "热门系列", eps: (n) => `共${n}集`, pop: "最多观看", fresh: "最新上传", other: "其他类型与国家", views: "次观看",
    all: (g) => `在网站查看全部${g}`, home: "首页", hub: "按类型浏览", hubT: "AI电影与短剧类型合集", hubD: "按类型和国家整理的AI电影、短剧和短片。点击即可查看热门系列和最新视频。",
    genres: "类型", countries: "国家", count: (n) => `${n}部`,
    faq: "常见问题",
    q1: (g) => `哪里可以免费观看AI${g}电影？`, a1: (g) => `All AI-Cinema汇集了YouTube上公开的AI${g}作品，可免费观看。视频通过YouTube播放器播放，无需注册。`,
    q2: (g) => `最受欢迎的AI${g}作品有哪些？`, a2: (v, w) => `目前播放量最高的是「${v.title}」（${v.channel}）。${w ? `热门系列有「${w.name}」（${w.channel}，共${w.list.length}集）。` : ""}`,
    q3: () => "新作品多久更新一次？", a3: (s) => `最近30天新增了${s.n30}部。网站每2小时检查一次频道并自动添加新视频。`,
  },
  es: {
    h: (g, c) => (c ? `Películas y series con IA de ${g}` : `Películas y series de ${g} hechas con IA`),
    t: (g, c) => (c ? `Películas, series y cortos con IA de ${g}` : `Las mejores películas y series de ${g} con IA – Gratis`),
    intro: (g, c, s) => `${s.more ? "Más de " : ""}${s.n} películas, series y cortos ${c ? "con IA de " + g : "de " + g + " hechos con IA"} publicados en YouTube, reunidos en un solo lugar. Vienen de ${s.ch} canales${s.w ? ` y ${s.w} series` : ""}; ${s.topN > 1 ? "los canales más activos son" : "el canal más activo es"} ${s.top}. En los últimos 30 días se añadieron ${s.n30} videos y se agregan nuevos automáticamente cada 2 horas.`,
    works: "Series populares", eps: (n) => `${n} episodios`, pop: "Más vistos", fresh: "Añadidos recientemente", other: "Otros géneros y países", views: "vistas",
    all: (g) => `Ver todo ${g} en el sitio`, home: "Inicio", hub: "Géneros", hubT: "Películas y series con IA por género", hubD: "Películas, series y cortos hechos con IA ordenados por género y país. Elige uno para ver series populares y los videos más recientes.",
    genres: "Géneros", countries: "Países", count: (n) => `${n} videos`,
    faq: "Preguntas frecuentes",
    q1: (g) => `¿Dónde ver películas de ${g} con IA gratis?`, a1: (g) => `All AI-Cinema reúne títulos de ${g} hechos con IA publicados en YouTube para verlos gratis en un solo lugar. Se reproducen en el reproductor de YouTube y no hace falta registrarse.`,
    q2: (g) => `¿Cuáles son los títulos de ${g} con IA más populares?`, a2: (v, w) => `El video más visto ahora es «${v.title}» de ${v.channel}.${w ? ` Una serie popular es «${w.name}» de ${w.channel} (${w.list.length} episodios).` : ""}`,
    q3: () => "¿Con qué frecuencia se añaden títulos nuevos?", a3: (s) => `En los últimos 30 días se añadieron ${s.n30} videos. El sitio revisa sus canales de YouTube cada 2 horas y añade los nuevos automáticamente.`,
  },
  vi: {
    h: (g, c) => (c ? `Phim & phim bộ AI từ ${g}` : `Phim & phim bộ AI thể loại ${g}`),
    t: (g, c) => (c ? `Phim, phim bộ & phim ngắn AI từ ${g}` : `Phim & phim bộ AI ${g} hay nhất – Xem miễn phí`),
    intro: (g, c, s) => `${s.more ? "Hơn " : ""}${s.n} phim, phim bộ và phim ngắn ${c ? "làm bằng AI từ " + g : "thể loại " + g + " làm bằng AI"} trên YouTube, gom về một nơi. Chúng đến từ ${s.ch} kênh${s.w ? ` và ${s.w} phim bộ` : ""}; ${s.topN > 1 ? "các kênh đăng nhiều nhất là" : "kênh đăng nhiều nhất là"} ${s.top}. Có ${s.n30} video mới trong 30 ngày qua, và video mới được thêm tự động mỗi 2 giờ.`,
    works: "Phim bộ nổi bật", eps: (n) => `${n} tập`, pop: "Xem nhiều nhất", fresh: "Mới thêm gần đây", other: "Thể loại & quốc gia khác", views: "lượt xem",
    all: (g) => `Xem tất cả ${g} trên trang`, home: "Trang chủ", hub: "Thể loại", hubT: "Phim & phim bộ AI theo thể loại", hubD: "Phim, phim bộ và phim ngắn làm bằng AI, sắp xếp theo thể loại và quốc gia. Chọn một mục để xem phim bộ nổi bật và video mới nhất.",
    genres: "Thể loại", countries: "Quốc gia", count: (n) => `${n} video`,
    faq: "Câu hỏi thường gặp",
    q1: (g) => `Xem phim AI ${g} miễn phí ở đâu?`, a1: (g) => `All AI-Cinema gom các phim AI ${g} công khai trên YouTube để bạn xem miễn phí ở một nơi. Video phát bằng trình phát YouTube và không cần đăng ký.`,
    q2: (g) => `Phim AI ${g} nào được yêu thích nhất?`, a2: (v, w) => `Video được xem nhiều nhất hiện nay là "${v.title}" của ${v.channel}.${w ? ` Một phim bộ nổi bật là "${w.name}" của ${w.channel} (${w.list.length} tập).` : ""}`,
    q3: () => "Bao lâu thì có phim mới?", a3: (s) => `Có ${s.n30} video mới trong 30 ngày qua. Trang kiểm tra các kênh YouTube mỗi 2 giờ và tự động thêm video mới.`,
  },
  ar: {
    h: (g, c) => (c ? `أفلام ومسلسلات بالذكاء الاصطناعي من ${g}` : `أفلام ومسلسلات ${g} بالذكاء الاصطناعي`),
    t: (g, c) => (c ? `أفلام ومسلسلات وأفلام قصيرة بالذكاء الاصطناعي من ${g}` : `أفضل أفلام ومسلسلات ${g} بالذكاء الاصطناعي – مجانًا`),
    intro: (g, c, s) => `${s.more ? "أكثر من " : ""}${s.n} فيلمًا ومسلسلًا وفيلمًا قصيرًا ${c ? "بالذكاء الاصطناعي من " + g : "من نوع " + g + " مصنوعة بالذكاء الاصطناعي"} على يوتيوب، في مكان واحد. تأتي من ${s.ch} قناة${s.w ? ` و${s.w} مسلسلًا` : ""}، و${s.topN > 1 ? "أنشط القنوات هي" : "أنشط قناة هي"} ${s.top}. أُضيف ${s.n30} فيديو جديد خلال آخر 30 يومًا، وتُضاف فيديوهات جديدة تلقائيًا كل ساعتين.`,
    works: "مسلسلات رائجة", eps: (n) => `${n} حلقة`, pop: "الأكثر مشاهدة", fresh: "أُضيف مؤخرًا", other: "أنواع ودول أخرى", views: "مشاهدة",
    all: (g) => `تصفّح كل ${g} على الموقع`, home: "الرئيسية", hub: "الأنواع", hubT: "أفلام ومسلسلات الذكاء الاصطناعي حسب النوع", hubD: "أفلام ومسلسلات وأفلام قصيرة مصنوعة بالذكاء الاصطناعي مرتبة حسب النوع والدولة. اختر واحدًا لترى المسلسلات الرائجة وأحدث الفيديوهات.",
    genres: "الأنواع", countries: "الدول", count: (n) => `${n} فيديو`,
    faq: "الأسئلة الشائعة",
    q1: (g) => `أين أشاهد أفلام ${g} بالذكاء الاصطناعي مجانًا؟`, a1: (g) => `يجمع All AI-Cinema أعمال ${g} المصنوعة بالذكاء الاصطناعي والمنشورة على يوتيوب لتشاهدها مجانًا في مكان واحد. تُعرض الفيديوهات عبر مشغّل يوتيوب ولا حاجة للتسجيل.`,
    q2: (g) => `ما أشهر أعمال ${g} بالذكاء الاصطناعي؟`, a2: (v, w) => `الفيديو الأكثر مشاهدة الآن هو «${v.title}» من قناة ${v.channel}.${w ? ` ومن المسلسلات الرائجة «${w.name}» من ${w.channel} (${w.list.length} حلقة).` : ""}`,
    q3: () => "كم مرة تُضاف أعمال جديدة؟", a3: (s) => `أُضيف ${s.n30} فيديو جديد خلال آخر 30 يومًا. يفحص الموقع قنوات يوتيوب كل ساعتين ويضيف الجديد تلقائيًا.`,
  },
};

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}
// 채널당 per편까지 고르고, 모자라면 남은 것으로 채움
function capPer(arr, n, key, per = 3) {
  const out = [], cnt = new Map(), rest = [];
  for (const x of arr) { const k = key(x); if ((cnt.get(k) || 0) < per) { cnt.set(k, (cnt.get(k) || 0) + 1); out.push(x); } else rest.push(x); if (out.length >= n) break; }
  return out.length < n ? [...out, ...rest.slice(0, n - out.length)] : out;
}
const card = (v, on = true) => `<a class="card pg-card" href="${on ? `/watch/${v.id}/` : `/?v=${v.id}`}"><div class="thumb"><img loading="lazy" decoding="async" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" width="320" height="180" alt="" /></div><div class="card__body"><div><h3>${esc(v.title)}</h3><p>${esc(v.channel)}</p></div></div></a>`;

export async function buildGenre({ PUB, SITE, loadI18n, ver, pagesOn = true }) {
  let site = {}, raw = {};
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  try { raw = JSON.parse(await readFile(resolve(PUB, "data/videos.json"), "utf8")); } catch {}
  const dirs = LANGS.map((l) => resolve(PUB, BASE[l].slice(1)));
  // 스위치 꺼짐 → 페이지 삭제
  if (site.genrePages === false) { for (const d of dirs) await rm(d, { recursive: true, force: true }); return { changed: 0, urls: [] }; }
  const kids = new Set(Array.isArray(raw.kids) ? raw.kids : []);
  const { videos: all, works } = await loadAll(PUB);
  const videos = all.filter((v) => !kids.has(v.id));
  const countries = new Set(Array.isArray(site.countries) ? site.countries : ["한국", "미국", "일본", "중국", "스페인"]);
  const now = Date.now();
  // 장르별 묶음
  const groups = [];
  for (const [cat, slug] of Object.entries(GENRE_SLUG)) {
    const vs = videos.filter((v) => v.categories.includes(cat));
    if (vs.length < MIN) continue;
    const isC = countries.has(cat);
    const chCount = new Map(); for (const v of vs) chCount.set(v.channel, (chCount.get(v.channel) || 0) + 1);
    const ws = works.filter((w) => w.list.filter((v) => v.categories.includes(cat)).length >= Math.ceil(w.list.length / 2))
      .map((w) => ({ w, views: w.list.reduce((t, v) => t + v.views, 0) })).sort((a, b) => b.views - a.views);
    const wsCapped = capPer(ws, 8, (x) => x.w.channel, 2);
    groups.push({
      cat, slug, isC, vs, ws: wsCapped,
      // 한 채널이 목록을 다 차지하지 않게 채널당 3편까지 (채널이 적으면 그만큼 채움)
      pop: capPer([...vs].sort((a, b) => b.views - a.views), 12, (v) => v.channel),
      fresh: capPer([...vs].sort((a, b) => (a.published < b.published ? 1 : -1)), 12, (v) => v.channel),
      stat: { n: floorN(vs.length), more: floorN(vs.length) < vs.length, ch: chCount.size, w: ws.length,
        n30: vs.filter((v) => now - Date.parse(v.published) < 30 * 864e5).length,
        topCh: [...chCount].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c) },
    });
  }
  const watchHome = (l, g) => `${HOME[l]}?${g.isC ? "n" : "c"}=${encodeURIComponent(g.cat)}`;
  const altLinks = (path) => LANGS.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${BASE[l]}${path}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}${BASE.en}${path}" />`;
  const altXml = (path) => LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${BASE[l]}${path}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${BASE.en}${path}"/>`;
  let changed = 0;
  const keep = new Map(LANGS.map((l) => [l, new Set()]));

  for (const l of LANGS) {
    const I = await loadI18n(l), T = TX[l], nm = (c) => I.name(c);
    const tags = (cur) => {
      const gs = groups.filter((g) => !g.isC), cs = groups.filter((g) => g.isC);
      const a = (g) => `<a class="geo-tag" href="${BASE[l]}${g.slug}/"${g === cur ? ' aria-current="page"' : ""}>${esc(nm(g.cat))} <small>${esc(compact(g.vs.length, l))}</small></a>`;
      return `<p><b>${esc(T.genres)}</b><br />${gs.map(a).join(" ")}</p>${cs.length ? `<p><b>${esc(T.countries)}</b><br />${cs.map(a).join(" ")}</p>` : ""}`;
    };
    // 모음 목록 (/genre/)
    {
      const url = SITE + BASE[l];
      const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(T.home)}</a> › <span>${esc(T.hub)}</span></nav>
    <h1 class="pg-title">${esc(T.hubT)}</h1>
    <p class="pg-desc">${esc(T.hubD)}</p>
    <section class="pg-sec">${tags(null)}</section>
    <p class="pg-all"><a class="btn btn--primary" href="${HOME[l]}">${esc(T.home)} →</a></p>`;
      const ld = [{ "@context": "https://schema.org", "@type": "CollectionPage", name: T.hubT, url, inLanguage: HTML_LANG[l],
        hasPart: groups.map((g) => ({ "@type": "CollectionPage", name: T.h(nm(g.cat), g.isC), url: `${SITE}${BASE[l]}${g.slug}/` })) }];
      const html = shell({ lang: l, title: `${T.hubT} | All AI-Cinema`, desc: T.hubD, url, image: `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: altLinks("") });
      if (await writeIfChanged(resolve(PUB, BASE[l].slice(1), "index.html"), html)) changed++;
    }
    for (const g of groups) {
      keep.get(l).add(g.slug);
      const gn = nm(g.cat), url = `${SITE}${BASE[l]}${g.slug}/`;
      const s = { ...g.stat, n: fmt(g.stat.n, l), n30: fmt(g.stat.n30, l), top: list(g.stat.topCh, l), topN: g.stat.topCh.length };
      const title = T.t(gn, g.isC), h1 = T.h(gn, g.isC), intro = T.intro(gn, g.isC, s);
      const topV = g.pop[0], topW = g.ws[0]?.w;
      const faq = [[T.q1(gn), T.a1(gn)], ...(topV ? [[T.q2(gn), T.a2(topV, topW)]] : []), [T.q3(), T.a3(s)]];
      const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[l]}">${esc(T.home)}</a> › <a href="${BASE[l]}">${esc(T.hub)}</a> › <span>${esc(gn)}</span></nav>
    <h1 class="pg-title">${esc(h1)}</h1>
    <p class="pg-desc">${esc(intro)}</p>
    <p class="pg-all"><a class="btn btn--primary" href="${watchHome(l, g)}">${esc(T.all(gn))} →</a></p>
    ${g.ws.length && pagesOn ? `<section class="pg-sec"><h2>${esc(T.works)}</h2><ol class="top-list">${g.ws.slice(0, 8).map(({ w }, i) => `
      <li class="top-item"><span class="top-rank">${i + 1}</span>
        <a class="top-thumb" href="/work/${w.slug}/"><img loading="lazy" src="https://i.ytimg.com/vi/${w.list[0].id}/mqdefault.jpg" width="320" height="180" alt="" /></a>
        <div class="top-txt"><a href="/work/${w.slug}/"><h3>${esc(w.name)}</h3></a><p class="muted">${esc(w.channel)} · ${esc(T.eps(w.list.length))}</p></div></li>`).join("")}
    </ol></section>` : ""}
    <section class="pg-sec"><h2>${esc(T.pop)}</h2><div class="grid pg-grid">${g.pop.map((v) => card(v, pagesOn)).join("")}</div></section>
    <section class="pg-sec"><h2>${esc(T.fresh)}</h2><div class="grid pg-grid">${g.fresh.map((v) => card(v, pagesOn)).join("")}</div></section>
    <section class="pg-sec"><h2>${esc(T.faq)}</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}</section>
    <section class="pg-sec"><h2>${esc(T.other)}</h2>${tags(g)}</section>`;
      const ld = [
        { "@context": "https://schema.org", "@type": "CollectionPage", name: h1, description: intro, url, inLanguage: HTML_LANG[l],
          mainEntity: { "@type": "ItemList", numberOfItems: g.pop.length, itemListElement: g.pop.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: pagesOn ? `${SITE}/watch/${v.id}/` : `${SITE}/?v=${v.id}`, name: v.title })) } },
        { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [[T.home, SITE + HOME[l]], [T.hub, SITE + BASE[l]], [gn, url]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
      ];
      const html = shell({ lang: l, title: `${title} | All AI-Cinema`, desc: intro.slice(0, 160), url, image: topV ? `https://i.ytimg.com/vi/${topV.id}/hqdefault.jpg` : `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: altLinks(`${g.slug}/`) });
      if (await writeIfChanged(resolve(PUB, BASE[l].slice(1), g.slug, "index.html"), html)) changed++;
    }
  }
  // 이제 없는 장르 페이지 삭제 (영상이 줄어 기준 미달 등)
  const { readdir } = await import("node:fs/promises");
  for (const l of LANGS) {
    let names = []; try { names = await readdir(resolve(PUB, BASE[l].slice(1))); } catch {}
    for (const n of names) if (n !== "index.html" && !keep.get(l).has(n)) { await rm(resolve(PUB, BASE[l].slice(1), n), { recursive: true, force: true }); changed++; }
  }
  return {
    changed,
    urls: [
      ...LANGS.map((l) => ({ loc: SITE + BASE[l], alts: altXml("") })),
      ...groups.flatMap((g) => LANGS.map((l) => ({ loc: `${SITE}${BASE[l]}${g.slug}/`, alts: altXml(`${g.slug}/`) }))),
    ],
  };
}

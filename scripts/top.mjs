// 주간 TOP 10: 이번 주(최근 7일) 올라온 AI 영화·드라마를 조회수 순으로 – 매 수집 때 갱신
//  - 이번 주: /top/, /en/top/, /ja/top/, /zh/top/, /es/top/
//  - 지난주 기록(주차별 보관): /top/2026-w48/, /en/top/2026-w48/ – 그 주가 끝나면 더는 바뀌지 않음
//  - seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { shell, esc, HTML_LANG, HOME, loadAll } from "./pages.mjs";

const LANGS = ["ko", "en", "ja", "zh", "es", "vi", "ar", "de", "fr", "it"];
const P = { ko: "/top/", en: "/en/top/", ja: "/ja/top/", zh: "/zh/top/", es: "/es/top/", vi: "/vi/top/", ar: "/ar/top/", de: "/de/top/", fr: "/fr/top/", it: "/it/top/" };
const HREF = { ko: "ko", en: "en", ja: "ja", zh: "zh-Hans", es: "es", vi: "vi", ar: "ar", de: "de", fr: "fr", it: "it" };
const TXT = {
  ko: { t: (w) => `주간 AI 영화·드라마 TOP 10 (${w})`, h: "이번 주 AI 영화·드라마 TOP 10", d: (r) => `${r} 사이 유튜브에 올라온 AI 영화·드라마·단편 중 조회수가 가장 높은 10편이에요. 2시간마다 자동으로 갱신돼요.`, views: "조회수", arch: "지난주 순위", watch: "보기", home: "홈", crumb: "주간 TOP 10" },
  en: { t: (w) => `Weekly Top 10 AI Movies & Dramas (${w})`, h: "Top 10 AI movies and dramas this week", d: (r) => `The 10 most-viewed AI movies, dramas and short films uploaded to YouTube ${r}. Updated every 2 hours.`, views: "views", arch: "Past weeks", watch: "Watch", home: "Home", crumb: "Weekly Top 10" },
  ja: { t: (w) => `週間AI映画・ドラマTOP10（${w}）`, h: "今週のAI映画・ドラマTOP10", d: (r) => `${r}にYouTubeに公開されたAI映画・ドラマ・短編のうち、再生回数が多い10本です。2時間ごとに自動更新されます。`, views: "回視聴", arch: "過去の週", watch: "見る", home: "ホーム", crumb: "週間TOP10" },
  zh: { t: (w) => `每周AI电影与短剧TOP 10（${w}）`, h: "本周AI电影与短剧TOP 10", d: (r) => `${r}期间上传到YouTube的AI电影、短剧和短片中播放量最高的10部，每2小时自动更新。`, views: "次观看", arch: "往期排行", watch: "观看", home: "首页", crumb: "每周TOP 10" },
  es: { t: (w) => `Top 10 semanal de películas y series con IA (${w})`, h: "Top 10 de películas y series con IA de esta semana", d: (r) => `Las 10 películas, series y cortos con IA más vistos subidos a YouTube ${r}. Se actualiza cada 2 horas.`, views: "vistas", arch: "Semanas anteriores", watch: "Ver", home: "Inicio", crumb: "Top 10 semanal" },
  vi: { t: (w) => `Top 10 phim & phim bộ AI trong tuần (${w})`, h: "Top 10 phim & phim bộ AI tuần này", d: (r) => `10 phim, phim bộ và phim ngắn làm bằng AI được xem nhiều nhất đăng lên YouTube ${r}. Cập nhật mỗi 2 giờ.`, views: "lượt xem", arch: "Các tuần trước", watch: "Xem", home: "Trang chủ", crumb: "Top 10 tuần" },
  ar: { t: (w) => `أفضل 10 أفلام بالذكاء الاصطناعي هذا الأسبوع (${w})`, h: "أفضل 10 أفلام ومسلسلات بالذكاء الاصطناعي هذا الأسبوع", d: (r) => `أكثر 10 أفلام ومسلسلات وأفلام قصيرة مصنوعة بالذكاء الاصطناعي مشاهدةً على يوتيوب ${r}. يُحدَّث كل ساعتين.`, views: "مشاهدة", arch: "الأسابيع السابقة", watch: "شاهد", home: "الرئيسية", crumb: "أفضل 10 أسبوعيًا" },
  de: { t: (w) => `Wöchentliche Top 10 KI-Filme & -Serien (${w})`, h: "Die Top 10 KI-Filme und -Serien dieser Woche", d: (r) => `Die 10 meistgesehenen mit KI erstellten Filme, Serien und Kurzfilme, die im Zeitraum ${r} auf YouTube hochgeladen wurden. Alle 2 Stunden aktualisiert.`, views: "Aufrufe", arch: "Frühere Wochen", watch: "Ansehen", home: "Startseite", crumb: "Wöchentliche Top 10" },
  fr: { t: (w) => `Top 10 hebdo des films et séries IA (${w})`, h: "Top 10 des films et séries IA de la semaine", d: (r) => `Les 10 films, séries et courts métrages IA les plus vus mis en ligne sur YouTube (${r}). Mis à jour toutes les 2 heures.`, views: "vues", arch: "Semaines précédentes", watch: "Regarder", home: "Accueil", crumb: "Top 10 de la semaine" },
  it: { t: (w) => `Top 10 settimanale di film e serie IA (${w})`, h: "Top 10 dei film e delle serie IA della settimana", d: (r) => `I 10 film, serie e cortometraggi IA più visti caricati su YouTube (${r}). Aggiornato ogni 2 ore.`, views: "visualizzazioni", arch: "Settimane precedenti", watch: "Guarda", home: "Home", crumb: "Top 10 della settimana" },
};
// 홍보용: 공유 버튼(언어별로 많이 쓰는 곳) + 관리자에서 복사할 글
const enc = encodeURIComponent;
const SHARE = {
  ko: { t: "공유하기", copy: "링크 복사", copied: "복사했어요", nets: ["naver", "x", "facebook"] },
  en: { t: "Share", copy: "Copy link", copied: "Copied", nets: ["x", "reddit", "facebook", "whatsapp"] },
  ja: { t: "シェア", copy: "リンクをコピー", copied: "コピーしました", nets: ["x", "line", "facebook"] },
  zh: { t: "分享", copy: "复制链接", copied: "已复制", nets: ["weibo", "x", "line", "facebook"] },
  es: { t: "Compartir", copy: "Copiar enlace", copied: "Copiado", nets: ["whatsapp", "x", "facebook", "reddit"] },
  vi: { t: "Chia sẻ", copy: "Sao chép liên kết", copied: "Đã sao chép", nets: ["facebook", "zalo", "x"] },
  ar: { t: "مشاركة", copy: "نسخ الرابط", copied: "تم النسخ", nets: ["whatsapp", "x", "facebook", "telegram"] },
  de: { t: "Teilen", copy: "Link kopieren", copied: "Kopiert", nets: ["whatsapp", "x", "facebook", "reddit"] },
  fr: { t: "Partager", copy: "Copier le lien", copied: "Copié", nets: ["whatsapp", "x", "facebook", "reddit"] },
  it: { t: "Condividi", copy: "Copia link", copied: "Copiato", nets: ["whatsapp", "facebook", "x", "telegram"] },
};
const NET = {
  x: ["X", (u, t) => `https://twitter.com/intent/tweet?text=${enc(t)}&url=${enc(u)}`],
  facebook: ["Facebook", (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}`],
  reddit: ["Reddit", (u, t) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(t)}`],
  whatsapp: ["WhatsApp", (u, t) => `https://wa.me/?text=${enc(t + " " + u)}`],
  line: ["LINE", (u) => `https://social-plugins.line.me/lineit/share?url=${enc(u)}`],
  naver: ["네이버 블로그", (u, t) => `https://share.naver.com/web/shareView?url=${enc(u)}&title=${enc(t)}`],
  weibo: ["微博", (u, t) => `https://service.weibo.com/share/share.php?url=${enc(u)}&title=${enc(t)}`],
  zalo: ["Zalo", (u) => `https://sp.zalo.me/share_inline?u=${enc(u)}`],
  telegram: ["Telegram", (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}`],
};
const TAGS = { ko: "#AI영화 #AI드라마 #AI단편영화 #주간TOP10", en: "#AIvideo #AIfilm #AImovies #AIart", ja: "#AI動画 #AI映画 #生成AI", zh: "#AI视频 #AI电影 #AI短剧", es: "#IA #películasIA #videoIA", vi: "#phimAI #AIvideo #phimngắnAI", ar: "#ذكاء_اصطناعي #أفلام_الذكاء_الاصطناعي #فيديو_AI", de: "#KI #KIFilm #KIVideo #KünstlicheIntelligenz", fr: "#IA #filmIA #vidéoIA #intelligenceartificielle", it: "#IA #filmIA #videoIA #intelligenzaartificiale" };
// 관리자 '주간 TOP 10 홍보 글'에서 복사해 쓰는 글 (SNS 짧은 글 · 블로그 글 · 커뮤니티 글)
function promoTexts(l, top, url, range, T, I) {
  const cut = (t, m) => ([...t].length > m ? [...t].slice(0, m).join("") + "…" : t);
  const n = (v, i) => `${i + 1}. ${cut(v.title, 50)} – ${v.channel}`;
  const top3 = top.slice(0, 3).map(n).join("\n");
  const all = top.map(n).join("\n");
  const genres = (v) => v.categories.slice(0, 2).map((c) => I.name(c)).join(", ");
  const blogItems = top.map((v, i) => `${i + 1}. ${v.title}\n   ${v.channel}${genres(v) ? " · " + genres(v) : ""}\n   ${SITE_URL}/watch/${v.id}/`).join("\n\n");
  const P = {
    ko: { sns: `이번 주 AI 영화·드라마 TOP 10 (${range})\n\n${top3}\n…\n\n전체 순위 👉 ${url}\n${TAGS.ko}`,
      blogT: `이번 주 AI 영화·드라마 TOP 10 (${range})`,
      blog: `${range} 사이 유튜브에 올라온 AI 영화·드라마·단편 가운데 조회수가 가장 높은 10편을 골랐어요.\n\n${blogItems}\n\n전체 순위와 지난주 기록: ${url}\n장르별 모음: ${SITE_URL}/genre/\n\n${TAGS.ko}`,
      comT: `이번 주 많이 본 AI 영화·드라마 TOP 10 (${range})`,
      com: `유튜브에 올라온 AI로 만든 영화·드라마 중 이번 주 조회수 순위예요.\n\n${all}\n\n순위 전체(영상 바로 보기): ${url}` },
    en: { sns: `This week's Top 10 AI movies & series (${range})\n\n${top3}\n…\n\nFull list 👉 ${url}\n${TAGS.en}`,
      blogT: `Top 10 AI Movies & Series This Week (${range})`,
      blog: `The 10 most-viewed AI-made movies, series and short films uploaded to YouTube ${range}.\n\n${blogItems}\n\nFull ranking & past weeks: ${url}\nBrowse by genre: ${SITE_URL}/en/genre/\n\n${TAGS.en}`,
      comT: `Top 10 most-watched AI films on YouTube this week (${range})`,
      com: `I track AI-made films and series on YouTube; here are this week's most-viewed:\n\n${all}\n\nFull list with links: ${url}` },
    ja: { sns: `今週のAI映画・ドラマTOP10（${range}）\n\n${top3}\n…\n\nランキング全体 👉 ${url}\n${TAGS.ja}`,
      blogT: `今週のAI映画・ドラマTOP10（${range}）`,
      blog: `${range}にYouTubeに公開されたAI映画・ドラマ・短編のうち、再生回数が多い10本です。\n\n${blogItems}\n\nランキング全体：${url}\nジャンル別：${SITE_URL}/ja/genre/\n\n${TAGS.ja}`,
      comT: `今週よく見られたAI映画・ドラマTOP10（${range}）`,
      com: `YouTubeのAI映画・ドラマ、今週の再生数ランキングです。\n\n${all}\n\nランキング全体：${url}` },
    zh: { sns: `本周AI电影与短剧TOP 10（${range}）\n\n${top3}\n…\n\n完整榜单 👉 ${url}\n${TAGS.zh}`,
      blogT: `本周AI电影与短剧TOP 10（${range}）`,
      blog: `${range}期间上传到YouTube的AI电影、短剧和短片中播放量最高的10部。\n\n${blogItems}\n\n完整榜单：${url}\n按类型浏览：${SITE_URL}/zh/genre/\n\n${TAGS.zh}`,
      comT: `本周最受欢迎的AI电影与短剧TOP 10（${range}）`,
      com: `YouTube上AI制作的电影和短剧本周播放量排行：\n\n${all}\n\n完整榜单：${url}` },
    es: { sns: `Top 10 de películas y series con IA de la semana (${range})\n\n${top3}\n…\n\nLista completa 👉 ${url}\n${TAGS.es}`,
      blogT: `Top 10 de películas y series con IA de la semana (${range})`,
      blog: `Las 10 películas, series y cortos hechos con IA más vistos subidos a YouTube ${range}.\n\n${blogItems}\n\nRanking completo: ${url}\nPor género: ${SITE_URL}/es/genre/\n\n${TAGS.es}`,
      comT: `Las 10 películas con IA más vistas esta semana (${range})`,
      com: `Ranking semanal de películas y series hechas con IA en YouTube:\n\n${all}\n\nLista completa: ${url}` },
    vi: { sns: `Top 10 phim & phim bộ AI tuần này (${range})\n\n${top3}\n…\n\nXem toàn bộ 👉 ${url}\n${TAGS.vi}`,
      blogT: `Top 10 phim & phim bộ AI tuần này (${range})`,
      blog: `10 phim, phim bộ và phim ngắn làm bằng AI được xem nhiều nhất đăng lên YouTube ${range}.\n\n${blogItems}\n\nBảng xếp hạng đầy đủ: ${url}\nTheo thể loại: ${SITE_URL}/vi/genre/\n\n${TAGS.vi}`,
      comT: `Top 10 phim AI được xem nhiều nhất tuần này (${range})`,
      com: `Bảng xếp hạng lượt xem tuần này của phim và phim bộ làm bằng AI trên YouTube:\n\n${all}\n\nDanh sách đầy đủ: ${url}` },
    ar: { sns: `أفضل 10 أفلام ومسلسلات بالذكاء الاصطناعي هذا الأسبوع (${range})\n\n${top3}\n…\n\nالقائمة كاملة 👈 ${url}\n${TAGS.ar}`,
      blogT: `أفضل 10 أفلام ومسلسلات بالذكاء الاصطناعي هذا الأسبوع (${range})`,
      blog: `أكثر 10 أفلام ومسلسلات وأفلام قصيرة مصنوعة بالذكاء الاصطناعي مشاهدةً على يوتيوب ${range}.\n\n${blogItems}\n\nالترتيب الكامل: ${url}\nحسب النوع: ${SITE_URL}/ar/genre/\n\n${TAGS.ar}`,
      comT: `أكثر 10 أفلام بالذكاء الاصطناعي مشاهدةً هذا الأسبوع (${range})`,
      com: `ترتيب هذا الأسبوع لأفلام ومسلسلات الذكاء الاصطناعي الأكثر مشاهدة على يوتيوب:\n\n${all}\n\nالقائمة كاملة: ${url}` },
    de: { sns: `Die Top 10 KI-Filme & -Serien der Woche (${range})\n\n${top3}\n…\n\nGanze Liste 👉 ${url}\n${TAGS.de}`,
      blogT: `Die Top 10 KI-Filme & -Serien der Woche (${range})`,
      blog: `Die 10 meistgesehenen mit KI erstellten Filme, Serien und Kurzfilme auf YouTube (${range}).\n\n${blogItems}\n\nKomplettes Ranking: ${url}\nNach Genre: ${SITE_URL}/de/genre/\n\n${TAGS.de}`,
      comT: `Die 10 meistgesehenen KI-Filme auf YouTube diese Woche (${range})`,
      com: `Ich verfolge KI-Filme und -Serien auf YouTube – das sind die meistgesehenen dieser Woche:\n\n${all}\n\nKomplette Liste mit Links: ${url}` },
    fr: { sns: `Top 10 des films et séries IA de la semaine (${range})\n\n${top3}\n…\n\nListe complète 👉 ${url}\n${TAGS.fr}`,
      blogT: `Top 10 des films et séries IA de la semaine (${range})`,
      blog: `Les 10 films, séries et courts métrages créés avec l'IA les plus vus sur YouTube (${range}).\n\n${blogItems}\n\nClassement complet : ${url}\nPar genre : ${SITE_URL}/fr/genre/\n\n${TAGS.fr}`,
      comT: `Les 10 films IA les plus vus sur YouTube cette semaine (${range})`,
      com: `Je suis les films et séries créés avec l'IA sur YouTube ; voici les plus vus de la semaine :\n\n${all}\n\nListe complète avec liens : ${url}` },
    it: { sns: `Top 10 film e serie IA della settimana (${range})\n\n${top3}\n…\n\nClassifica completa 👉 ${url}\n${TAGS.it}`,
      blogT: `Top 10 film e serie IA della settimana (${range})`,
      blog: `I 10 film, serie e cortometraggi creati con l'IA più visti su YouTube (${range}).\n\n${blogItems}\n\nClassifica completa: ${url}\nPer genere: ${SITE_URL}/it/genre/\n\n${TAGS.it}`,
      comT: `I 10 film IA più visti su YouTube questa settimana (${range})`,
      com: `Seguo i film e le serie creati con l'IA su YouTube; ecco i più visti della settimana:\n\n${all}\n\nClassifica completa con link: ${url}` },
  };
  return P[l];
}
let SITE_URL = "";
const WHY = {"ko": ["선정 기준", "최근 7일 동안 유튜브에 올라온 AI 영화·드라마·단편을 조회수 순으로 골랐어요. 한 채널이 순위를 독차지하지 않도록 채널당 3편까지만 넣고, 제작자가 외부 재생을 허용한 공개 영상만 대상으로 해요. 이번 주 영상이 10편이 안 되면 최근 14일까지 넓혀요. 순위는 2시간마다 새로 계산해요.", "이번 주 1위는 {c}의 「{t}」예요."], "en": ["How we pick", "We rank AI-made movies, series and shorts uploaded to YouTube in the last 7 days by views. To keep one channel from taking over, each channel can have at most 3 entries, and only public videos whose creators allow embedding are included. If fewer than 10 were uploaded this week, we look back 14 days. Rankings are recalculated every 2 hours.", "This week's #1 is \"{t}\" by {c}."], "ja": ["選定基準", "直近7日間にYouTubeに公開されたAI映画・ドラマ・短編を再生回数順に選んでいます。1つのチャンネルが独占しないよう1チャンネル3本まで、制作者が外部再生を許可した公開動画のみが対象です。今週の動画が10本に満たない場合は直近14日まで広げます。順位は2時間ごとに再計算します。", "今週の1位は{c}の「{t}」です。"], "zh": ["评选标准", "按播放量挑选最近7天上传到YouTube的AI电影、短剧和短片。为避免单个频道包揽榜单，每个频道最多3部，且只收录创作者允许外部播放的公开视频。本周视频不足10部时，扩大到最近14天。排名每2小时重新计算。", "本周第1名是{c}的「{t}」。"], "es": ["Cómo elegimos", "Ordenamos por vistas las películas, series y cortos hechos con IA subidos a YouTube en los últimos 7 días. Para que ningún canal acapare el ranking, cada canal tiene como máximo 3 entradas, y solo incluimos videos públicos cuyos creadores permiten insertarlos. Si esta semana hay menos de 10, ampliamos a 14 días. El ranking se recalcula cada 2 horas.", "El n.º 1 de esta semana es «{t}» de {c}."], "vi": ["Cách chọn", "Chúng tôi xếp hạng phim, phim bộ và phim ngắn làm bằng AI đăng lên YouTube trong 7 ngày qua theo lượt xem. Để không kênh nào chiếm hết bảng, mỗi kênh tối đa 3 phim, và chỉ tính video công khai được nhà sáng tạo cho phép nhúng. Nếu tuần này chưa đủ 10 phim, chúng tôi mở rộng ra 14 ngày. Bảng xếp hạng được tính lại mỗi 2 giờ.", "Hạng 1 tuần này là \"{t}\" của {c}."], "ar": ["معايير الاختيار", "نرتّب حسب المشاهدات الأفلام والمسلسلات والأفلام القصيرة المصنوعة بالذكاء الاصطناعي التي رُفعت على يوتيوب خلال آخر 7 أيام. ولكي لا تستحوذ قناة واحدة على القائمة، لكل قناة 3 أعمال كحد أقصى، ونكتفي بالفيديوهات العامة التي يسمح أصحابها بتضمينها. إذا قلّ العدد عن 10 هذا الأسبوع نوسّع إلى 14 يومًا. يُعاد حساب الترتيب كل ساعتين.", "المركز الأول هذا الأسبوع: «{t}» من {c}."], "de": ["So wählen wir aus", "Wir sortieren mit KI erstellte Filme, Serien und Kurzfilme, die in den letzten 7 Tagen auf YouTube hochgeladen wurden, nach Aufrufen. Damit kein Kanal die Liste dominiert, hat jeder Kanal höchstens 3 Plätze, und es zählen nur öffentliche Videos, deren Ersteller das Einbetten erlauben. Gibt es diese Woche weniger als 10, schauen wir 14 Tage zurück. Das Ranking wird alle 2 Stunden neu berechnet.", "Platz 1 diese Woche: „{t}“ von {c}."], "fr": ["Comment nous choisissons", "Nous classons par nombre de vues les films, séries et courts métrages créés avec l'IA mis en ligne sur YouTube ces 7 derniers jours. Pour qu'aucune chaîne n'accapare le classement, chaque chaîne a au maximum 3 places, et seules les vidéos publiques dont les créateurs autorisent l'intégration sont retenues. S'il y en a moins de 10 cette semaine, nous remontons à 14 jours. Le classement est recalculé toutes les 2 heures.", "Le n° 1 de la semaine : « {t} » de {c}."], "it": ["Come scegliamo", "Ordiniamo per visualizzazioni i film, le serie e i cortometraggi creati con l'IA caricati su YouTube negli ultimi 7 giorni. Perché nessun canale domini la classifica, ogni canale ha al massimo 3 posti, e contano solo i video pubblici i cui creatori consentono l'incorporamento. Se questa settimana sono meno di 10, guardiamo agli ultimi 14 giorni. La classifica viene ricalcolata ogni 2 ore.", "Il n. 1 di questa settimana è «{t}» di {c}."]};
const fmt = (n, l) => new Intl.NumberFormat(HTML_LANG[l], { notation: "compact", maximumFractionDigits: 1 }).format(n);
const day = (d, l) => new Intl.DateTimeFormat(HTML_LANG[l], { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(d);
// ISO 주차 (서울 시간 기준)
function isoWeek(date) {
  const d = new Date(date.getTime() + 9 * 3600e3);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-w${String(w).padStart(2, "0")}`;
}
async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildTop({ PUB, SITE, loadI18n, ver, pagesOn = true }) {
  SITE_URL = SITE;
  const promo = { week: "", langs: {} };
  const { videos } = await loadAll(PUB);
  const now = new Date(), wk = isoWeek(now);
  const since = new Date(now - 7 * 864e5);
  let pool = videos.filter((v) => new Date(v.published) >= since);
  if (pool.length < 10) pool = videos.filter((v) => new Date(v.published) >= new Date(now - 14 * 864e5));
  // 한 채널이 다 차지하지 않게 채널당 3편까지
  const top = [], per = new Map();
  for (const v of pool.sort((a, b) => b.views - a.views)) {
    if ((per.get(v.channel) || 0) >= 3) continue;
    per.set(v.channel, (per.get(v.channel) || 0) + 1); top.push(v);
    if (top.length >= 10) break;
  }
  const watchUrl = (v) => (pagesOn ? `/watch/${v.id}/` : `/?v=${v.id}`);
  // 지난주 기록 목록
  let weeks = [];
  try { weeks = (await readdir(resolve(PUB, "top"))).filter((n) => /^\d{4}-w\d{2}$/.test(n) && n !== wk).sort().reverse(); } catch {}
  let changed = 0;
  const page = async (lang, url, file, title, archive) => {
    const I = await loadI18n(lang), T = TXT[lang];
    const range = `${day(new Date(now - 7 * 864e5), lang)} ~ ${day(now, lang)}`;
    const S = SHARE[lang], shareText = archive ? title : `${T.h} (${range})`;
    if (!archive) promo.langs[lang] = { url, range, ...promoTexts(lang, top, url, range, T, I) };
    const alts = archive ? "" : LANGS.map((l) => `<link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${P[l]}" />`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${SITE}/en/top/" />`;
    const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="${HOME[lang]}">${esc(T.home)}</a> › <span>${esc(T.crumb)}</span></nav>
    <h1 class="pg-title">${esc(archive ? T.t(wk) : T.h)}</h1>
    <p class="pg-desc">${esc(T.d(range))}</p>
    <ol class="top-list">${top.map((v, i) => `
      <li class="top-item"><span class="top-rank">${i + 1}</span>
        <a class="top-thumb" href="${watchUrl(v)}"><img loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" width="320" height="180" alt="" /></a>
        <div class="top-txt"><a href="${watchUrl(v)}"><h2>${esc(v.title)}</h2></a><p class="muted">${esc(v.channel)} · ${esc(fmt(v.views, lang))} ${esc(T.views)}${v.categories.length ? " · " + v.categories.slice(0, 3).map((c) => esc(I.name(c))).join(", ") : ""}</p></div></li>`).join("")}
    </ol>
    ${top[0] ? `<section class="pg-sec"><h2>${esc(WHY[lang][0])}</h2><p>${esc(WHY[lang][2].replace("{t}", top[0].title).replace("{c}", top[0].channel))} ${esc(WHY[lang][1])}</p></section>` : ""}
    <div class="share-bar" data-copied="${esc(S.copied)}"><b>${esc(S.t)}</b>
      <button type="button" class="share-btn" data-share-copy="${esc(url)}">${esc(S.copy)}</button>
      ${S.nets.map((k) => `<a class="share-btn" href="${esc(NET[k][1](url, shareText))}" target="_blank" rel="noopener nofollow">${esc(NET[k][0])}</a>`).join("\n      ")}
    </div>
    ${!archive && weeks.some((w) => existsSync(resolve(PUB, P[lang].slice(1), w))) ? `<section class="pg-sec"><h2>${esc(T.arch)}</h2><p>${weeks.filter((w) => existsSync(resolve(PUB, P[lang].slice(1), w))).slice(0, 26).map((w) => `<a class="geo-tag" href="${P[lang].replace(/\/$/, "")}/${w}/">${w.replace("-w", " · W")}</a>`).join(" ")}</p></section>` : ""}
    <p class="pg-all"><a class="btn btn--primary" href="${HOME[lang]}">${esc(T.home)} →</a></p>`;
    const ld = [{ "@context": "https://schema.org", "@type": "ItemList", name: title, url, inLanguage: HTML_LANG[lang], numberOfItems: top.length,
      itemListElement: top.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + watchUrl(v), name: v.title })) }];
    const html = shell({ lang, title: `${title} | All AI-Cinema`, desc: T.d(range), url, image: top[0] ? `https://i.ytimg.com/vi/${top[0].id}/hqdefault.jpg` : `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, head: alts + `\n  <script src="/assets/share.js?v=${ver}" defer></script>` });
    if (await writeIfChanged(file, html)) changed++;
  };
  if (!top.length) return { changed, urls: [] };
  for (const l of LANGS) await page(l, SITE + P[l], resolve(PUB, P[l].slice(1), "index.html"), TXT[l].t(wk), false);
  // 이번 주 기록 (주가 바뀌면 그대로 남음)
  for (const l of LANGS) await page(l, `${SITE}${P[l]}${wk}/`, resolve(PUB, P[l].slice(1), wk, "index.html"), TXT[l].t(wk), true);
  // 관리자 '주간 TOP 10 홍보 글'용 (공개 정보만)
  promo.week = wk; promo.at = new Date().toISOString().slice(0, 10);
  const pf = resolve(PUB, "data/top-promo.json");
  try { const old = JSON.parse(await readFile(pf, "utf8")); if (JSON.stringify({ ...old, at: 0 }) === JSON.stringify({ ...promo, at: 0 })) promo.at = old.at; } catch {}
  await writeIfChanged(pf, JSON.stringify(promo, null, 1) + "\n");
  const alts = LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${HREF[l]}" href="${SITE}${P[l]}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en/top/"/>`;
  return {
    changed,
    urls: [...LANGS.map((l) => ({ loc: SITE + P[l], alts })), ...[wk, ...weeks].flatMap((w) => LANGS.filter((l) => l === "ko" || l === "en" || w === wk || existsSync(resolve(PUB, P[l].slice(1), w))).map((l) => ({ loc: `${SITE}${P[l]}${w}/` })))],
  };
}

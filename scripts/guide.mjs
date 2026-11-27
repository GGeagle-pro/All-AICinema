// 작품·영상 자동 분석 글 (10개 언어) – 수집한 데이터로 사이트가 직접 만드는 설명
//  - 작품: 언제부터 몇 화, 업데이트 주기, 가장 많이 본 회차, 최근 반응(초반 대비)
//  - 영상: 어떤 채널의 어떤 장르, 공개일, 그 채널 안에서의 인기 정도
//  - 자주 바뀌는 숫자(조회수)는 글에 넣지 않음 → 페이지가 매시간 다시 써지지 않게
//  - 관리자가 쓴 에디터 노트: site.json workNotes { "채널 / 작품이름": "한국어 글" 또는 { ko, en, ja, zh, es } }
export const LANGS = ["ko", "en", "ja", "zh", "es", "vi", "ar", "de", "fr", "it"];

const DATE = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN", es: "es-ES", vi: "vi-VN", ar: "ar", de: "de-DE", fr: "fr-FR", it: "it-IT" };
const ym = (iso, l) => new Intl.DateTimeFormat(DATE[l], { year: "numeric", month: "long", timeZone: "Asia/Seoul" }).format(new Date(iso));
const ymd = (iso, l) => new Intl.DateTimeFormat(DATE[l], { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(iso));
const DEFAULT_COUNTRIES = new Set(["한국", "미국", "일본", "중국", "스페인", "영국", "프랑스", "대만", "홍콩", "인도네시아"]);
// "한국 판타지·액션" 처럼: 국가 1개 + 장르 2개까지
function genreText(cats, l, name, countries) {
  const u = [...new Set(cats)].filter((c) => c !== "기타");
  const c = u.find((x) => countries.has(x)), gs = u.filter((x) => !countries.has(x)).slice(0, 2).map(name);
  const LAT = ["en", "es", "vi", "de", "fr", "it"].includes(l);
  const g = gs.join(LAT ? " / " : l === "ar" ? " و" : "·");
  if (!c) return g;
  const cn = name(c);
  return LAT || l === "ar" ? `${g ? g + " " : ""}(${cn})` : `${cn} ${g}`.trim();
}
const list = (arr, l) => { try { return new Intl.ListFormat(DATE[l], { type: "conjunction" }).format(arr); } catch { return arr.join(", "); } };

const PACE = {
  ko: (d) => (d < 1.5 ? "거의 매일 새 화가 올라와요" : `평균 ${Math.round(d)}일마다 새 화가 올라와요`),
  en: (d) => (d < 1.5 ? "new episodes arrive almost daily" : `a new episode arrives about every ${Math.round(d)} days`),
  ja: (d) => (d < 1.5 ? "ほぼ毎日新しい話が公開されています" : `平均${Math.round(d)}日ごとに新しい話が公開されています`),
  zh: (d) => (d < 1.5 ? "几乎每天都有新一集" : `平均每${Math.round(d)}天更新一集`),
  es: (d) => (d < 1.5 ? "sale un episodio nuevo casi cada día" : `sale un episodio nuevo cada ${Math.round(d)} días aprox.`),
  vi: (d) => (d < 1.5 ? "gần như ngày nào cũng có tập mới" : `khoảng ${Math.round(d)} ngày lại có một tập mới`),
  ar: (d) => (d < 1.5 ? "تصدر حلقة جديدة يوميًا تقريبًا" : `تصدر حلقة جديدة كل ${Math.round(d)} أيام تقريبًا`),
  de: (d) => (d < 1.5 ? "fast täglich erscheint eine neue Folge" : `etwa alle ${Math.round(d)} Tage erscheint eine neue Folge`),
  fr: (d) => (d < 1.5 ? "un nouvel épisode sort presque chaque jour" : `un nouvel épisode sort environ tous les ${Math.round(d)} jours`),
  it: (d) => (d < 1.5 ? "esce un nuovo episodio quasi ogni giorno" : `esce un nuovo episodio circa ogni ${Math.round(d)} giorni`),
};
const PAUSED = { ko: "최근에는 새 화가 뜸해 완결됐거나 쉬는 중이에요", en: "no new episodes lately, so it may be finished or on a break", ja: "最近は更新がなく、完結または休止中のようです", zh: "最近没有更新，可能已完结或暂停", es: "no hay episodios nuevos últimamente: puede estar terminada o en pausa", vi: "gần đây không có tập mới, có thể đã hết hoặc đang tạm nghỉ", ar: "لا توجد حلقات جديدة مؤخرًا، فربما انتهى أو توقف مؤقتًا", de: "zuletzt keine neuen Folgen – vielleicht abgeschlossen oder pausiert", fr: "pas de nouvel épisode récemment : elle est peut-être terminée ou en pause", it: "nessun nuovo episodio di recente: forse è conclusa o in pausa" };

// 작품 분석
export function workAnalysis(w, l, name = (c) => c, countries = DEFAULT_COUNTRIES) {
  const eps = w.list;
  const ts = eps.map((x) => Date.parse(x.published)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ts.length) return "";
  const pace = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 864e5 / (ts.length - 1) : 0;
  const idle = (Date.now() - ts[ts.length - 1]) / 864e5;
  const genre = genreText(eps.flatMap((x) => x.categories), l, name, countries);
  const since = ym(new Date(ts[0]).toISOString(), l), n = eps.length;
  let best = 0; eps.forEach((x, i) => { if ((x.views || 0) > (eps[best].views || 0)) best = i; });
  const third = Math.max(1, Math.floor(n / 3));
  const avg = (a) => a.reduce((t, x) => t + (x.views || 0), 0) / (a.length || 1);
  const early = avg(eps.slice(0, third)), late = avg(eps.slice(-third));
  const trend = n >= 4 && early > 0 ? (late > early * 1.3 ? "up" : late < early * 0.5 ? "down" : "") : "";
  const paceTxt = pace ? (idle > Math.max(14, pace * 4) ? PAUSED[l] : PACE[l](pace)) : "";
  const T = {
    ko: () => [`${w.channel} 채널이 ${since}부터 공개하고 있는 ${genre ? genre + " " : ""}AI 시리즈예요.`, `지금까지 ${n}화가 올라왔고${paceTxt ? ", " + paceTxt : "요"}.`,
      n > 1 && eps[best].views ? `가장 많이 본 회차는 ${best + 1}화예요.` : "",
      trend === "up" ? "최근 회차일수록 조회수가 높아서 요즘 반응이 좋은 작품이에요." : trend === "down" ? "초반 회차의 조회수가 높아서 1화부터 보는 분이 많아요." : ""],
    en: () => [`An AI-made ${genre ? genre + " " : ""}series by ${w.channel}, released since ${since}.`, `${n} episode${n > 1 ? "s" : ""} so far${paceTxt ? "; " + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `The most-watched is episode ${best + 1}.` : "",
      trend === "up" ? "Later episodes get more views than the early ones, so it's picking up momentum." : trend === "down" ? "The early episodes have the most views, so most people start from episode 1." : ""],
    ja: () => [`${w.channel}が${since}から公開している${genre ? genre + "の" : ""}AIシリーズです。`, `これまでに${n}話が公開され${paceTxt ? "、" + paceTxt : "ています"}。`,
      n > 1 && eps[best].views ? `最も再生されているのは第${best + 1}話です。` : "",
      trend === "up" ? "最近の話ほど再生数が多く、今まさに人気が高まっている作品です。" : trend === "down" ? "序盤の話の再生数が多く、第1話から見る人が多い作品です。" : ""],
    zh: () => [`这是 ${w.channel} 自${since}起发布的${genre ? genre + "类" : ""}AI系列。`, `目前共${n}集${paceTxt ? "，" + paceTxt : ""}。`,
      n > 1 && eps[best].views ? `播放最多的是第${best + 1}集。` : "",
      trend === "up" ? "越新的剧集播放量越高，最近人气正在上升。" : trend === "down" ? "前几集播放量最高，多数观众从第1集开始看。" : ""],
    es: () => [`Serie ${genre ? "de " + genre + " " : ""}hecha con IA por ${w.channel}, publicada desde ${since}.`, `Lleva ${n} episodio${n > 1 ? "s" : ""}${paceTxt ? "; " + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `El más visto es el episodio ${best + 1}.` : "",
      trend === "up" ? "Los episodios recientes tienen más vistas que los primeros: está ganando público." : trend === "down" ? "Los primeros episodios son los más vistos: casi todos empiezan por el 1." : ""],
    vi: () => [`Phim bộ ${genre ? genre + " " : ""}làm bằng AI của kênh ${w.channel}, phát hành từ ${since}.`, `Đã có ${n} tập${paceTxt ? "; " + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `Tập được xem nhiều nhất là tập ${best + 1}.` : "",
      trend === "up" ? "Các tập gần đây được xem nhiều hơn các tập đầu, phim đang ngày càng hút khán giả." : trend === "down" ? "Các tập đầu được xem nhiều nhất, nên đa số người xem bắt đầu từ tập 1." : ""],
    ar: () => [`مسلسل ${genre ? genre + " " : ""}مصنوع بالذكاء الاصطناعي من قناة ${w.channel}، يُعرض منذ ${since}.`, `صدرت حتى الآن ${n} حلقة${paceTxt ? "، و" + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `الحلقة الأكثر مشاهدة هي الحلقة ${best + 1}.` : "",
      trend === "up" ? "الحلقات الأحدث تحصد مشاهدات أكثر من الأولى، فشعبيته في ازدياد." : trend === "down" ? "الحلقات الأولى هي الأكثر مشاهدة، لذا يبدأ معظم المشاهدين من الحلقة 1." : ""],
    de: () => [`Eine mit KI erstellte Serie${genre ? " (" + genre + ")" : ""} von ${w.channel}, veröffentlicht seit ${since}.`, `Bisher ${n} Folge${n > 1 ? "n" : ""}${paceTxt ? "; " + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `Am meisten gesehen ist Folge ${best + 1}.` : "",
      trend === "up" ? "Neuere Folgen haben mehr Aufrufe als die ersten – die Serie gewinnt gerade an Fahrt." : trend === "down" ? "Die ersten Folgen haben die meisten Aufrufe, die meisten starten also bei Folge 1." : ""],
    fr: () => [`Une série ${genre ? genre + " " : ""}créée avec l'IA par ${w.channel}, publiée depuis ${since}.`, `${n} épisode${n > 1 ? "s" : ""} pour l'instant${paceTxt ? " ; " + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `L'épisode le plus vu est le ${best + 1}.` : "",
      trend === "up" ? "Les épisodes récents sont plus vus que les premiers : la série prend de l'élan." : trend === "down" ? "Les premiers épisodes sont les plus vus : la plupart commencent par l'épisode 1." : ""],
    it: () => [`Una serie ${genre ? genre + " " : ""}creata con l'IA da ${w.channel}, pubblicata da ${since}.`, `Finora ${n} episodi${n > 1 ? "" : "o"}${paceTxt ? "; " + paceTxt : ""}.`,
      n > 1 && eps[best].views ? `L'episodio più visto è il ${best + 1}.` : "",
      trend === "up" ? "Gli episodi recenti hanno più visualizzazioni dei primi: la serie sta crescendo." : trend === "down" ? "I primi episodi sono i più visti: quasi tutti iniziano dall'episodio 1." : ""],
  };
  return T[l]().filter(Boolean).join(l === "ja" || l === "zh" ? "" : " ").replace(/\.\./g, ".");
}

// 채널 안에서의 인기 순위 (0=가장 인기, 1=가장 덜) – 채널 영상이 5편 이상일 때만
export function channelRanks(videos) {
  const by = new Map();
  for (const v of videos) { if (!by.has(v.channel)) by.set(v.channel, []); by.get(v.channel).push(v); }
  const rank = new Map();
  for (const arr of by.values()) {
    if (arr.length < 5) continue;
    const s = [...arr].sort((a, b) => (b.views || 0) - (a.views || 0));
    s.forEach((v, i) => rank.set(v.id, i / (s.length - 1)));
  }
  return rank;
}

// 영상 분석 (작품에 속한 영상은 몇 화인지까지)
export function videoAnalysis(v, l, { rank, work, ep, name = (c) => c, countries = DEFAULT_COUNTRIES } = {}) {
  const g = genreText(v.categories || [], l, name, countries);
  const d = ymd(v.published, l);
  const tier = rank == null ? "" : rank <= 0.1 ? "top" : rank <= 0.3 ? "high" : "";
  const T = {
    ko: [`${v.channel} 채널이 ${d}에 공개한 ${g ? g + " " : ""}AI 영상이에요.`, work ? `「${work}」 ${ep}화예요.` : "",
      tier === "top" ? "이 채널 영상 가운데 손꼽히게 많이 본 편이에요." : tier === "high" ? "이 채널에서 많이 본 편에 속해요." : ""],
    en: [`An AI-made ${g ? g + " " : ""}video by ${v.channel}, released ${d}.`, work ? `Episode ${ep} of "${work}".` : "",
      tier === "top" ? "One of this channel's most-watched videos." : tier === "high" ? "Among the more popular videos on this channel." : ""],
    ja: [`${v.channel}が${d}に公開した${g ? g + "の" : ""}AI動画です。`, work ? `「${work}」第${ep}話です。` : "",
      tier === "top" ? "このチャンネルでも特に再生数の多い作品です。" : tier === "high" ? "このチャンネルの中でよく見られている作品です。" : ""],
    zh: [`${v.channel} 于${d}发布的${g ? g + "类" : ""}AI视频。`, work ? `「${work}」第${ep}集。` : "",
      tier === "top" ? "是该频道播放量最高的作品之一。" : tier === "high" ? "在该频道中属于较受欢迎的作品。" : ""],
    es: [`Video ${g ? "de " + g + " " : ""}hecho con IA por ${v.channel}, publicado el ${d}.`, work ? `Episodio ${ep} de «${work}».` : "",
      tier === "top" ? "Uno de los videos más vistos del canal." : tier === "high" ? "Entre los videos más populares del canal." : ""],
    vi: [`Video ${g ? g + " " : ""}làm bằng AI của kênh ${v.channel}, đăng ngày ${d}.`, work ? `Tập ${ep} của "${work}".` : "",
      tier === "top" ? "Một trong những video được xem nhiều nhất của kênh." : tier === "high" ? "Thuộc nhóm video nổi bật của kênh." : ""],
    ar: [`فيديو ${g ? g + " " : ""}مصنوع بالذكاء الاصطناعي من قناة ${v.channel}، نُشر في ${d}.`, work ? `الحلقة ${ep} من «${work}».` : "",
      tier === "top" ? "من أكثر فيديوهات القناة مشاهدة." : tier === "high" ? "من الفيديوهات الرائجة في القناة." : ""],
    de: [`Ein mit KI erstelltes Video${g ? " (" + g + ")" : ""} von ${v.channel}, veröffentlicht am ${d}.`, work ? `Folge ${ep} von „${work}“.` : "",
      tier === "top" ? "Eines der meistgesehenen Videos dieses Kanals." : tier === "high" ? "Gehört zu den beliebteren Videos des Kanals." : ""],
    fr: [`Une vidéo ${g ? g + " " : ""}créée avec l'IA par ${v.channel}, publiée le ${d}.`, work ? `Épisode ${ep} de « ${work} ».` : "",
      tier === "top" ? "L'une des vidéos les plus vues de la chaîne." : tier === "high" ? "Parmi les vidéos populaires de la chaîne." : ""],
    it: [`Un video ${g ? g + " " : ""}creato con l'IA da ${v.channel}, pubblicato il ${d}.`, work ? `Episodio ${ep} di «${work}».` : "",
      tier === "top" ? "Uno dei video più visti del canale." : tier === "high" ? "Tra i video più popolari del canale." : ""],
  };
  return T[l].filter(Boolean).join(l === "ja" || l === "zh" ? "" : " ").replace(/\.\./g, ".");
}

// 관리자 에디터 노트 (그 언어로 쓴 글만, 없으면 "")
export const noteKey = (w) => `${w.channel} / ${w.name}`;
export function editorNote(notes, w, l) {
  const n = notes?.[noteKey(w)];
  if (!n) return "";
  if (typeof n === "string") return l === "ko" ? n.slice(0, 1000) : "";
  return typeof n[l] === "string" ? n[l].slice(0, 1000) : "";
}

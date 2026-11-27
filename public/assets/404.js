// 404 페이지: 주소(/en/ …)나 브라우저 언어에 맞춰 문구·홈 링크 바꾸기
(() => {
  const T = {
    en: ["Page not found", "This page has moved or no longer exists. Find AI movies and dramas on the home page.", "Go to home", "FAQ"],
    ja: ["ページが見つかりません", "ページが移動または削除されました。ホームでAI映画・ドラマを探してみてください。", "ホームへ", "よくある質問"],
    zh: ["找不到页面", "页面已移动或删除。请到首页查找AI电影和短剧。", "返回首页", "常见问题"],
    es: ["Página no encontrada", "Esta página se movió o ya no existe. Busca películas y series con IA en la página de inicio.", "Ir al inicio", "Preguntas frecuentes"],
    vi: ["Không tìm thấy trang", "Trang này đã chuyển hoặc không còn nữa. Hãy tìm phim và phim bộ AI ở trang chủ.", "Về trang chủ", "Câu hỏi thường gặp"],
    ar: ["الصفحة غير موجودة", "نُقلت هذه الصفحة أو لم تعد موجودة. ابحث عن أفلام ومسلسلات الذكاء الاصطناعي في الصفحة الرئيسية.", "إلى الرئيسية", "الأسئلة الشائعة"],
    de: ["Seite nicht gefunden", "Diese Seite wurde verschoben oder existiert nicht mehr. Auf der Startseite findest du KI-Filme und -Serien.", "Zur Startseite", "FAQ"],
    fr: ["Page introuvable", "Cette page a été déplacée ou n'existe plus. Retrouvez les films et séries IA sur la page d'accueil.", "Aller à l'accueil", "FAQ"],
    it: ["Pagina non trovata", "Questa pagina è stata spostata o non esiste più. Trovi film e serie IA nella home.", "Vai alla home", "Domande frequenti"],
  };
  let lang = (location.pathname.match(/^\/(en|ja|zh|es|vi|ar|de|fr|it)\//) || [])[1];
  if (!lang) { try { lang = localStorage.getItem("aic:lang") || ""; } catch {} }
  if (!lang) { const n = (navigator.language || "ko").slice(0, 2); lang = n === "ko" ? "ko" : T[n] ? n : "en"; }
  if (!T[lang]) return;
  const [t, d, h, f] = T[lang];
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
  if (lang === "ar") document.documentElement.dir = "rtl";
  document.title = `${t} – All AI-Cinema`;
  document.getElementById("nfT").textContent = t;
  document.getElementById("nfD").textContent = d;
  const home = document.getElementById("nfHome"); home.textContent = h; home.href = `/${lang}/`;
  const faq = document.getElementById("nfFaq"); faq.textContent = f; faq.href = `/${lang}/faq/`;
  document.querySelector(".brand").href = `/${lang}/`;
  document.querySelector(".nf__en").hidden = true;
})();

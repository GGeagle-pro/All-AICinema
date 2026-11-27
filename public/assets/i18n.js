/* All AI-Cinema – 다국어 (한국어 · English · 日本語 · 简体中文 · Español · Tiếng Việt · العربية · Deutsch · Français · Italiano)
 * - 화면 문구는 한국어 원문을 열쇠로 번역합니다. 번역이 없으면 한국어 그대로.
 * - 영상 제목·채널 이름·작품 이름(제작자 콘텐츠)은 번역하지 않습니다.
 * - 언어 선택: 주소 ?lang= → 이전에 고른 언어(이 브라우저) → 브라우저 언어 → 한국어
 */
(() => {
  "use strict";
  const LANGS = [
    { code: "ko", label: "한국어", short: "KO", html: "ko", yt: "ko" },
    { code: "en", label: "English", short: "EN", html: "en", yt: "en" },
    { code: "ja", label: "日本語", short: "JA", html: "ja", yt: "ja" },
    { code: "zh", label: "简体中文", short: "中文", html: "zh-Hans", yt: "zh-Hans" },
    { code: "es", label: "Español", short: "ES", html: "es", yt: "es" },
    { code: "vi", label: "Tiếng Việt", short: "VI", html: "vi", yt: "vi" },
    { code: "ar", label: "العربية", short: "AR", html: "ar", yt: "ar", rtl: true },
    { code: "de", label: "Deutsch", short: "DE", html: "de", yt: "de" },
    { code: "fr", label: "Français", short: "FR", html: "fr", yt: "fr" },
    { code: "it", label: "Italiano", short: "IT", html: "it", yt: "it" },
  ];
  const CODES = LANGS.map((l) => l.code);

  // ── 번역 사전 (한국어 원문 → [English, 日本語, 简体中文, Español, Tiếng Việt, العربية, Deutsch, Français, Italiano]) ──
  const D = {
    // 기본 화면
    "AI 영화·드라마 모아보기": ["AI Movies & Dramas, All in One Place","AI映画・ドラマまとめ","AI电影·剧集合集","Películas y series de IA, todo en un lugar","Phim & phim bộ AI, tất cả ở một nơi","أفلام ومسلسلات الذكاء الاصطناعي في مكان واحد","KI-Filme & -Serien an einem Ort","Films et séries IA, tout au même endroit","Film e serie IA, tutto in un unico posto"],
    "제목·채널 검색": ["Search titles & channels","タイトル・チャンネル検索","搜索标题和频道","Buscar títulos y canales","Tìm tiêu đề & kênh","ابحث عن العناوين والقنوات","Titel & Kanäle suchen","Rechercher titres et chaînes","Cerca titoli e canali"],
    "영상 검색": ["Search videos","動画を検索","搜索视频","Buscar videos","Tìm video","ابحث عن فيديو","Videos suchen","Rechercher des vidéos","Cerca video"],
    "즐겨찾기": ["Save","お気に入り","收藏","Guardar","Lưu","حفظ","Speichern","Enregistrer","Salva"],
    "즐겨찾기 · 홈 화면에 추가": ["Bookmark · Add to Home Screen","お気に入り・ホーム画面に追加","收藏 · 添加到主屏幕","Favoritos · Añadir a la pantalla de inicio","Dấu trang · Thêm vào màn hình chính","المفضلة · إضافة إلى الشاشة الرئيسية","Lesezeichen · Zum Startbildschirm","Favori · Écran d'accueil","Segnalibro · Schermata Home"],
    "검색 열기": ["Open search","検索を開く","打开搜索","Abrir búsqueda","Mở tìm kiếm","فتح البحث","Suche öffnen","Ouvrir la recherche","Apri ricerca"],
    "검색": ["Search","検索","搜索","Buscar","Tìm kiếm","بحث","Suchen","Rechercher","Cerca"],
    "검색 닫기": ["Close search","検索を閉じる","关闭搜索","Cerrar búsqueda","Đóng tìm kiếm","إغلاق البحث","Suche schließen","Fermer la recherche","Chiudi ricerca"],
    "검색어 지우기": ["Clear","クリア","清除","Borrar","Xóa","مسح","Löschen","Effacer","Cancella"],
    "국가": ["Country","国・地域","国家/地区","País","Quốc gia","الدولة","Land","Pays","Paese"],
    "장르": ["Genre","ジャンル","类型","Género","Thể loại","النوع","Genre","Genre","Genere"],
    "유튜브 채널": ["YouTube channels","YouTubeチャンネル","YouTube频道","Canales de YouTube","Kênh YouTube","قنوات يوتيوب","YouTube-Kanäle","Chaînes YouTube","Canali YouTube"],
    "채널 모두 펼치기": ["Show all channels","すべてのチャンネルを表示","展开全部频道","Ver todos los canales","Hiện tất cả kênh","عرض كل القنوات","Alle Kanäle anzeigen","Voir toutes les chaînes","Mostra tutti i canali"],
    "채널 목록 접기": ["Collapse channels","チャンネルを閉じる","收起频道","Contraer canales","Thu gọn kênh","طي القنوات","Kanäle einklappen","Réduire les chaînes","Comprimi canali"],
    "광고": ["Ad","広告","广告","Anuncio","Quảng cáo","إعلان","Anzeige","Pub","Annuncio"],
    "광고 배너": ["Ad banner","広告バナー","广告横幅","Banner publicitario","Banner quảng cáo","لافتة إعلانية","Werbebanner","Bannière publicitaire","Banner pubblicitario"],
    "언어": ["Language","言語","语言","Idioma","Ngôn ngữ","اللغة","Sprache","Langue","Lingua"],
    "최신 영상": ["Latest videos","新着動画","最新视频","Videos recientes","Video mới nhất","أحدث الفيديوهات","Neueste Videos","Vidéos récentes","Video più recenti"],
    "{where} 최신 영상": ["Latest in {where}","{where}の新着","{where} · 最新视频","Lo más reciente en {where}","Mới nhất ở {where}","الأحدث في {where}","Neu in {where}","Nouveautés : {where}","Novità in {where}"],
    "최신순": ["Newest","新しい順","最新","Más recientes","Mới nhất","الأحدث","Neueste","Plus récentes","Più recenti"],
    "조회수순": ["Most viewed","再生回数順","最多观看","Más vistos","Xem nhiều nhất","الأكثر مشاهدة","Meistgesehen","Plus vues","Più visti"],
    "정렬": ["Sort","並べ替え","排序","Ordenar","Sắp xếp","ترتيب","Sortieren","Trier","Ordina"],
    "돌아가기": ["Back","戻る","返回","Volver","Quay lại","رجوع","Zurück","Retour","Indietro"],
    "검색 해제 ×": ["Clear search ×","検索を解除 ×","清除搜索 ×","Quitar búsqueda ×","Bỏ tìm kiếm ×","إلغاء البحث ×","Suche löschen ×","Effacer la recherche ×","Cancella ricerca ×"],
    "업데이트 {t}": ["Updated {t}","{t}更新","{t}更新","Actualizado {t}","Cập nhật {t}","تم التحديث {t}","Aktualisiert {t}","Mis à jour {t}","Aggiornato {t}"],
    "모든 국가": ["All countries","すべての国","全部国家","Todos los países","Tất cả quốc gia","كل الدول","Alle Länder","Tous les pays","Tutti i paesi"],
    "전체": ["All","すべて","全部","Todo","Tất cả","الكل","Alle","Tout","Tutti"],
    "홈": ["Home","ホーム","首页","Inicio","Trang chủ","الرئيسية","Startseite","Accueil","Home"],
    "AI 제작 도구": ["AI creation tools","AI制作ツール","AI创作工具","Herramientas de IA","Công cụ tạo AI","أدوات الإنشاء بالذكاء الاصطناعي","KI-Tools zum Erstellen","Outils de création IA","Strumenti di creazione IA"],
    "자주 묻는 질문": ["FAQ","よくある質問","常见问题","Preguntas frecuentes","Câu hỏi thường gặp","الأسئلة الشائعة","FAQ","FAQ","FAQ"],
    "주간 TOP 10": ["Weekly Top 10","週間TOP10","每周TOP 10","Top 10 semanal","Top 10 tuần","أفضل 10 هذا الأسبوع","Wöchentliche Top 10","Top 10 de la semaine","Top 10 della settimana"],
    "장르별 모음": ["Genres","ジャンル別","按类型浏览","Géneros","Thể loại","الأنواع","Genres","Genres","Generi"],
    "▶ 재생하기": ["▶ Play","▶ 再生","▶ 播放","▶ Reproducir","▶ Phát","▶ تشغيل","▶ Abspielen","▶ Lire","▶ Riproduci"],
    "다음 화 자동 재생으로 보기": ["Watch with autoplay","連続再生で見る","连续自动播放","Ver con reproducción automática","Xem với tự động phát","شاهد مع التشغيل التلقائي","Mit Autoplay ansehen","Regarder en lecture auto","Guarda con riproduzione automatica"],
    "전체 회차": ["All episodes","全エピソード","全部剧集","Todos los episodios","Tất cả các tập","كل الحلقات","Alle Folgen","Tous les épisodes","Tutti gli episodi"],
    "같은 채널의 다른 영상": ["More from this channel","このチャンネルの他の動画","该频道的更多视频","Más de este canal","Thêm từ kênh này","المزيد من هذه القناة","Mehr von diesem Kanal","Plus de cette chaîne","Altro da questo canale"],
    "작품 보기": ["View series","作品を見る","查看剧集","Ver serie","Xem phim bộ","عرض المسلسل","Serie ansehen","Voir la série","Vedi la serie"],
    "올린 날짜": ["Uploaded","公開日","上传日期","Publicado","Ngày đăng","تاريخ النشر","Hochgeladen","Mise en ligne","Caricato"],
    "영상 소개": ["About this video","動画の紹介","视频简介","Sobre este video","Giới thiệu video","عن هذا الفيديو","Über dieses Video","À propos de cette vidéo","Informazioni sul video"],
    "작품 소개": ["About this series","作品紹介","剧集简介","Sobre esta serie","Giới thiệu phim bộ","عن هذا المسلسل","Über diese Serie","À propos de cette série","Informazioni sulla serie"],
    "AI로 만든 영상입니다. 저작권은 원 채널에 있으며, 유튜브 공식 플레이어로 재생됩니다.": ["This video was made with AI. All rights belong to the original channel; it plays via the official YouTube player.","AIで制作された動画です。著作権は元のチャンネルに帰属し、YouTube公式プレーヤーで再生されます。","本视频由AI制作，版权归原频道所有，通过YouTube官方播放器播放。","Video creado con IA. Los derechos pertenecen al canal original; se reproduce con el reproductor oficial de YouTube.","Video này được tạo bằng AI. Bản quyền thuộc về kênh gốc; video phát qua trình phát YouTube chính thức.","هذا الفيديو مصنوع بالذكاء الاصطناعي. جميع الحقوق للقناة الأصلية، ويُعرض عبر مشغّل يوتيوب الرسمي.","Dieses Video wurde mit KI erstellt. Alle Rechte liegen beim ursprünglichen Kanal; es wird über den offiziellen YouTube-Player abgespielt.","Cette vidéo a été créée avec l'IA. Tous les droits appartiennent à la chaîne d'origine ; elle est lue via le lecteur YouTube officiel.","Questo video è stato creato con l'IA. Tutti i diritti appartengono al canale originale; viene riprodotto con il player ufficiale di YouTube."],
    "아직 영상이 없어요.": ["No videos yet.","まだ動画がありません。","暂无视频。","Aún no hay videos.","Chưa có video.","لا توجد فيديوهات بعد.","Noch keine Videos.","Pas encore de vidéos.","Ancora nessun video."],
    "모든 채널": ["All channels","すべてのチャンネル","全部频道","Todos los canales","Tất cả kênh","كل القنوات","Alle Kanäle","Toutes les chaînes","Tutti i canali"],
    "몰아보기": ["Binge-watch","一気見","连看合集","Maratón","Xem liền mạch","مشاهدة متواصلة","Am Stück ansehen","Tout regarder d'affilée","Maratona"],
    "몰아보기 · 정주행": ["Binge-watch · Full series","一気見・全話","连看 · 全集","Maratón · Serie completa","Xem liền mạch · Trọn bộ","مشاهدة متواصلة · المسلسل كاملًا","Am Stück · Ganze Serie","D'affilée · Série complète","Maratona · Serie completa"],
    "NEW · 최근 3일 새 영상": ["NEW · Last 3 days","NEW・直近3日間","NEW · 最近3天","NUEVO · Últimos 3 días","MỚI · 3 ngày qua","جديد · آخر 3 أيام","NEU · Letzte 3 Tage","NOUVEAU · 3 derniers jours","NOVITÀ · Ultimi 3 giorni"],
    "NEW: 최근 3일 새 영상 {n}개": ["NEW: {n} videos in the last 3 days","NEW: 直近3日間の新着{n}本","NEW：最近3天新视频{n}个","NUEVO: {n} videos en los últimos 3 días","MỚI: {n} video trong 3 ngày qua","جديد: {n} فيديو في آخر 3 أيام","NEU: {n} Videos in den letzten 3 Tagen","NOUVEAU : {n} vidéos ces 3 derniers jours","NOVITÀ: {n} video negli ultimi 3 giorni"],
    "{label} 영상 {n}개": ["{label}: {n} videos","{label}: {n}本","{label}：{n}个视频","{label}: {n} videos","{label}: {n} video","{label}: {n} فيديو","{label}: {n} Videos","{label} : {n} vidéos","{label}: {n} video"],
    "\"{q}\" 검색 결과 {n}개": ["{n} results for \"{q}\"","「{q}」の検索結果 {n}件","“{q}”的搜索结果 {n}个","{n} resultados para \"{q}\"","{n} kết quả cho \"{q}\"","{n} نتيجة لـ \"{q}\"","{n} Ergebnisse für „{q}“","{n} résultats pour « {q} »","{n} risultati per \"{q}\""],
    "{name} 전체 회차": ["{name} · All episodes","{name} 全話","{name} · 全部集数","{name} · Todos los episodios","{name} · Tất cả các tập","{name} · كل الحلقات","{name} · Alle Folgen","{name} · Tous les épisodes","{name} · Tutti gli episodi"],
    // 빈 화면
    "아직 수집된 영상이 없습니다.": ["No videos yet.","まだ動画がありません。","暂无视频。","Aún no hay videos.","Chưa có video.","لا توجد فيديوهات بعد.","Noch keine Videos.","Pas encore de vidéos.","Ancora nessun video."],
    "아직 {country} 채널이 없어요. 곧 추가될 예정이에요.": ["No channels from {country} yet. Coming soon.","{country}のチャンネルはまだありません。近日追加予定です。","暂无{country}频道，即将添加。","Aún no hay canales de {country}. Muy pronto.","Chưa có kênh nào từ {country}. Sắp có.","لا توجد قنوات من {country} بعد. قريبًا.","Noch keine Kanäle aus {country}. Bald verfügbar.","Pas encore de chaînes de {country}. Bientôt disponible.","Ancora nessun canale da {country}. In arrivo."],
    "아직 찜한 영상이 없어요. 영상 화면에서 ♡ 찜을 누르면 여기에 모여요.": ["No saved videos yet. Tap ♡ Save on a video to collect it here.","お気に入りはまだありません。動画画面で ♡ を押すとここに集まります。","还没有收藏。在视频页面点 ♡ 收藏即可保存到这里。","Aún no has guardado videos. Toca ♡ Guardar en un video para reunirlo aquí.","Chưa có video đã lưu. Nhấn ♡ Lưu trên video để lưu vào đây.","لا توجد فيديوهات محفوظة بعد. اضغط ♡ حفظ على أي فيديو لجمعه هنا.","Noch nichts gespeichert. Tippe bei einem Video auf ♡ Speichern, um es hier zu sammeln.","Rien d'enregistré pour l'instant. Touchez ♡ Enregistrer sur une vidéo pour la retrouver ici.","Nessun video salvato. Tocca ♡ Salva su un video per ritrovarlo qui."],
    "아직 본 영상이 없어요.": ["You haven't watched anything yet.","視聴履歴はまだありません。","还没有观看记录。","Aún no has visto nada.","Bạn chưa xem video nào.","لم تشاهد أي شيء بعد.","Du hast noch nichts angesehen.","Vous n'avez encore rien regardé.","Non hai ancora guardato nulla."],
    "최근 3일 동안 새로 올라온 영상이 없어요.": ["No new videos in the last 3 days.","直近3日間の新着はありません。","最近3天没有新视频。","No hay videos nuevos en los últimos 3 días.","Không có video mới trong 3 ngày qua.","لا توجد فيديوهات جديدة في آخر 3 أيام.","Keine neuen Videos in den letzten 3 Tagen.","Aucune nouvelle vidéo ces 3 derniers jours.","Nessun nuovo video negli ultimi 3 giorni."],
    "이 메뉴에는 아직 영상이 없어요.": ["No videos here yet.","このメニューにはまだ動画がありません。","这里还没有视频。","Aún no hay videos aquí.","Chưa có video ở đây.","لا توجد فيديوهات هنا بعد.","Hier gibt es noch keine Videos.","Pas encore de vidéos ici.","Ancora nessun video qui."],
    "데이터를 불러오지 못했습니다": ["Couldn't load the video list","動画リストを読み込めませんでした","无法加载视频列表","No se pudo cargar la lista de videos","Không tải được danh sách video","تعذّر تحميل قائمة الفيديوهات","Videoliste konnte nicht geladen werden","Impossible de charger la liste des vidéos","Impossibile caricare l'elenco dei video"],
    // 알림
    "새 영상 {n}개 ↑": ["{n} new videos ↑","新着 {n}本 ↑","{n}个新视频 ↑","{n} videos nuevos ↑","{n} video mới ↑","{n} فيديو جديد ↑","{n} neue Videos ↑","{n} nouvelles vidéos ↑","{n} nuovi video ↑"],
    "지난 방문 이후 새 영상 {n}개 ›": ["{n} new since your last visit ›","前回以降の新着 {n}本 ›","自上次访问以来 {n} 个新视频 ›","{n} nuevos desde tu última visita ›","{n} video mới từ lần trước ›","{n} جديد منذ زيارتك الأخيرة ›","{n} neu seit deinem letzten Besuch ›","{n} nouveautés depuis votre dernière visite ›","{n} novità dall'ultima visita ›"],
    "지난 방문 이후 새 영상": ["New since your last visit","前回訪問以降の新着","自上次访问以来的新视频","Nuevos desde tu última visita","Mới từ lần ghé trước","الجديد منذ زيارتك الأخيرة","Neu seit deinem letzten Besuch","Nouveau depuis votre dernière visite","Novità dall'ultima visita"],
    // 줄(선반)
    "이어서 보기": ["Continue watching","続きを見る","继续观看","Seguir viendo","Xem tiếp","متابعة المشاهدة","Weiterschauen","Reprendre la lecture","Continua a guardare"],
    "봤어요": ["Watched","視聴済み","已看","Visto","Đã xem","تمت المشاهدة","Gesehen","Vu","Visto"],
    "에디터 노트": ["Editor's note","編集部メモ","编辑点评","Nota del editor","Ghi chú biên tập","ملاحظة المحرر","Anmerkung der Redaktion","Note de la rédaction","Nota della redazione"],
    "작품 분석": ["Analysis","作品分析","作品分析","Análisis","Phân tích","تحليل","Analyse","Analyse","Analisi"],
    "이런 분께 추천해요": ["Who will enjoy it","こんな方におすすめ","推荐给这些观众","Para quién es","Dành cho ai","لمن يناسب","Für wen es passt","Pour qui","Per chi è"],
    "{n}화까지 봤어요": ["You've watched up to episode {n}","第{n}話まで視聴しました","已看到第{n}集","Has visto hasta el episodio {n}","Bạn đã xem đến tập {n}","شاهدت حتى الحلقة {n}","Du hast bis Folge {n} gesehen","Vous avez regardé jusqu'à l'épisode {n}","Hai visto fino all'episodio {n}"],
    "▶ 이어보기 ({n}화)": ["▶ Resume (Ep. {n})","▶ 続きを見る（第{n}話）","▶ 继续观看（第{n}集）","▶ Continuar (ep. {n})","▶ Xem tiếp (Tập {n})","▶ استئناف (الحلقة {n})","▶ Fortsetzen (Folge {n})","▶ Reprendre (ép. {n})","▶ Riprendi (ep. {n})"],
    "▶ {n}화 보기": ["▶ Watch Ep. {n}","▶ 第{n}話を見る","▶ 观看第{n}集","▶ Ver ep. {n}","▶ Xem tập {n}","▶ شاهد الحلقة {n}","▶ Folge {n} ansehen","▶ Voir l'ép. {n}","▶ Guarda l'ep. {n}"],
    "자동 다음이 켜져 있으면 한 편이 끝날 때 다음 화가 바로 이어져요": ["With Autoplay on, the next episode starts as soon as one ends.","「自動で次へ」がオンなら、1話終わると次の話がすぐ始まります。","开启“自动播放下一个”后，一集结束会立即播放下一集。","Con la reproducción automática activada, el siguiente episodio empieza al terminar uno.","Khi bật Tự động phát, tập tiếp theo sẽ bắt đầu ngay khi tập này kết thúc.","عند تشغيل التشغيل التلقائي تبدأ الحلقة التالية فور انتهاء الحالية.","Mit Autoplay startet die nächste Folge, sobald eine endet.","Avec la lecture auto, l'épisode suivant démarre dès que l'un se termine.","Con la riproduzione automatica, l'episodio successivo parte appena uno finisce."],
    "최근 본 영상": ["Recently watched","最近見た動画","最近观看","Vistos recientemente","Đã xem gần đây","شوهد مؤخرًا","Zuletzt angesehen","Vus récemment","Visti di recente"],
    "♥ 찜한 영상": ["♥ My list","♥ お気に入り","♥ 我的收藏","♥ Mi lista","♥ Danh sách của tôi","♥ قائمتي","♥ Meine Liste","♥ Ma liste","♥ La mia lista"],
    "찜한 영상": ["My list","お気に入り","我的收藏","Mi lista","Danh sách của tôi","قائمتي","Meine Liste","Ma liste","La mia lista"],
    "내가 찜한": ["Saved by you","保存した動画","我收藏的","Guardados por ti","Bạn đã lưu","ما حفظته","Von dir gespeichert","Enregistrées par vous","Salvati da te"],
    "새로 올라온 영상": ["Just added","新着動画","最新上传","Recién añadidos","Vừa thêm","أُضيف للتو","Gerade hinzugefügt","Tout juste ajoutées","Appena aggiunti"],
    "최근 3일": ["Last 3 days","直近3日間","最近3天","Últimos 3 días","3 ngày qua","آخر 3 أيام","Letzte 3 Tage","3 derniers jours","Ultimi 3 giorni"],
    "인기 작품": ["Popular series","人気作品","热门作品","Series populares","Phim bộ nổi bật","مسلسلات رائجة","Beliebte Serien","Séries populaires","Serie popolari"],
    "작품별로 정주행": ["Watch series in order","作品ごとに一気見","按作品追剧","Ver series en orden","Xem phim bộ theo thứ tự","شاهد المسلسلات بالترتيب","Serien der Reihe nach","Séries dans l'ordre","Serie in ordine"],
    "한 번에 이어 보기": ["Watch in one go","まとめて視聴","一次看完","Para ver de un tirón","Xem một mạch","شاهد دفعة واحدة","Am Stück ansehen","Tout voir d'un coup","Guarda tutto d'un fiato"],
    "{ch}의 작품": ["Series by {ch}","{ch}の作品","{ch}的作品","Series de {ch}","Phim bộ của {ch}","مسلسلات {ch}","Serien von {ch}","Séries de {ch}","Serie di {ch}"],
    "작품을 누르면 1화부터 볼 수 있어요": ["Pick a series to start from episode 1","作品を選ぶと第1話から見られます","选择作品即可从第1集开始看","Elige una serie para empezar desde el episodio 1","Chọn một phim bộ để xem từ tập 1","اختر مسلسلًا لتبدأ من الحلقة 1","Wähle eine Serie und starte bei Folge 1","Choisissez une série et commencez à l'épisode 1","Scegli una serie e inizia dall'episodio 1"],
    "{n}편": ["{n} videos","{n}本","{n}个","{n} videos","{n} video","{n} فيديو","{n} Videos","{n} vidéos","{n} video"],
    "{n}작품": ["{n} series","{n}作品","{n}部作品","{n} series","{n} phim bộ","{n} مسلسل","{n} Serien","{n} séries","{n} serie"],
    "전체 보기 ›": ["See all ›","すべて見る ›","查看全部 ›","Ver todo ›","Xem tất cả ›","عرض الكل ›","Alle ansehen ›","Tout voir ›","Vedi tutti ›"],
    "이전": ["Previous","前へ","上一个","Anterior","Trước","السابق","Zurück","Précédent","Precedente"],
    "다음": ["Next","次へ","下一个","Siguiente","Tiếp","التالي","Weiter","Suivant","Successivo"],
    // 대표 영상·카드
    "최신 업로드": ["Latest upload","最新アップロード","最新上传","Último video","Đăng mới nhất","أحدث رفع","Neuester Upload","Dernière mise en ligne","Ultimo caricamento"],
    "▶ 지금 보기": ["▶ Watch now","▶ 今すぐ見る","▶ 立即观看","▶ Ver ahora","▶ Xem ngay","▶ شاهد الآن","▶ Jetzt ansehen","▶ Regarder","▶ Guarda ora"],
    "조회수 {n}회": ["{n} views","{n}回視聴","{n}次观看","{n} visualizaciones","{n} lượt xem","{n} مشاهدة","{n} Aufrufe","{n} vues","{n} visualizzazioni"],
    "새 회차": ["New episode","最新話","新剧集","Nuevo episodio","Tập mới","حلقة جديدة","Neue Folge","Nouvel épisode","Nuovo episodio"],
    "EP.{n}까지": ["Up to EP.{n}","EP.{n}まで","更新至EP.{n}","Hasta EP.{n}","Đến tập {n}","حتى الحلقة {n}","Bis Folge {n}","Jusqu'à l'ép. {n}","Fino all'ep. {n}"],
    // 작품 화면
    "작품": ["Series","作品","作品","Serie","Phim bộ","مسلسل","Serie","Série","Serie"],
    "작품 정보": ["Series info","作品情報","作品信息","Información de la serie","Thông tin phim bộ","معلومات المسلسل","Serien-Info","Infos de la série","Info sulla serie"],
    "총 {n}편": ["{n} episodes","全{n}本","共{n}集","{n} episodios","{n} tập","{n} حلقة","{n} Folgen","{n} épisodes","{n} episodi"],
    "최근 업데이트 {t}": ["Updated {t}","最終更新 {t}","{t}更新","Actualizado {t}","Cập nhật {t}","تم التحديث {t}","Aktualisiert {t}","Mis à jour {t}","Aggiornato {t}"],
    "▶ 1화부터 보기": ["▶ Start from EP.1","▶ 第1話から見る","▶ 从第1集看","▶ Empezar desde EP.1","▶ Bắt đầu từ tập 1","▶ ابدأ من الحلقة 1","▶ Ab Folge 1","▶ Depuis l'ép. 1","▶ Dall'ep. 1"],
    "최신화 보기": ["Latest episode","最新話を見る","看最新一集","Último episodio","Tập mới nhất","أحدث حلقة","Neueste Folge","Dernier épisode","Ultimo episodio"],
    "전체 {n}편 보기 ›": ["All {n} episodes ›","全{n}本を見る ›","全部{n}集 ›","Los {n} episodios ›","Tất cả {n} tập ›","كل الحلقات ({n}) ›","Alle {n} Folgen ›","Les {n} épisodes ›","Tutti i {n} episodi ›"],
    "전체 {n}편": ["{n} episodes","全{n}本","共{n}集","{n} episodios","{n} tập","{n} حلقة","{n} Folgen","{n} épisodes","{n} episodi"],
    // 플레이어
    "닫기": ["Close","閉じる","关闭","Cerrar","Đóng","إغلاق","Schließen","Fermer","Chiudi"],
    "◀ 이전": ["◀ Prev","◀ 前へ","◀ 上一集","◀ Anterior","◀ Trước","السابق","◀ Zurück","◀ Préc.","◀ Prec."],
    "다음 ▶": ["Next ▶","次へ ▶","下一集 ▶","Siguiente ▶","Tiếp ▶","التالي","Weiter ▶","Suiv. ▶","Succ. ▶"],
    "자동 다음": ["Autoplay","自動再生","自动播放","Automático","Tự động phát","تشغيل تلقائي","Autoplay","Lecture auto","Riproduzione automatica"],
    "공유": ["Share","共有","分享","Compartir","Chia sẻ","مشاركة","Teilen","Partager","Condividi"],
    "링크 복사됨": ["Link copied","リンクをコピーしました","链接已复制","Enlace copiado","Đã sao chép liên kết","تم نسخ الرابط","Link kopiert","Lien copié","Link copiato"],
    "공유하기": ["Share","共有する","分享","Compartir","Chia sẻ","مشاركة","Teilen","Partager","Condividi"],
    "카카오톡": ["KakaoTalk","カカオトーク","KakaoTalk","KakaoTalk","KakaoTalk","KakaoTalk","KakaoTalk","KakaoTalk","KakaoTalk"],
    "인스타그램": ["Instagram","Instagram","Instagram","Instagram","Instagram","Instagram","Instagram","Instagram","Instagram"],
    "링크 복사": ["Copy link","リンクをコピー","复制链接","Copiar enlace","Sao chép liên kết","نسخ الرابط","Link kopieren","Copier le lien","Copia link"],
    "더보기": ["More","その他","更多","Más","Xem thêm","المزيد","Mehr","Plus","Altro"],
    "접기": ["Less","閉じる","收起","Menos","Thu gọn","أقل","Weniger","Moins","Meno"],
    "닫기": ["Close","閉じる","关闭","Cerrar","Đóng","إغلاق","Schließen","Fermer","Chiudi"],
    "링크를 복사했어요. 인스타그램 DM이나 스토리에 붙여 넣어 주세요.": ["Link copied. Paste it into an Instagram DM or story.","リンクをコピーしました。InstagramのDMやストーリーに貼り付けてください。","链接已复制，可粘贴到 Instagram 私信或快拍中。","Enlace copiado. Pégalo en un DM o historia de Instagram.","Đã sao chép liên kết. Dán vào tin nhắn hoặc story Instagram.","تم نسخ الرابط. الصقه في رسالة أو قصة على إنستغرام.","Link kopiert. Füge ihn in eine Instagram-DM oder Story ein.","Lien copié. Collez-le dans un message ou une story Instagram.","Link copiato. Incollalo in un DM o in una storia di Instagram."],
    "링크를 복사했어요. 카카오톡 대화창에 붙여 넣어 주세요.": ["Link copied. Paste it into a KakaoTalk chat.","リンクをコピーしました。カカオトークに貼り付けてください。","链接已复制，可粘贴到 KakaoTalk 聊天中。","Enlace copiado. Pégalo en un chat de KakaoTalk.","Đã sao chép liên kết. Dán vào cuộc trò chuyện KakaoTalk.","تم نسخ الرابط. الصقه في محادثة KakaoTalk.","Link kopiert. Füge ihn in einen KakaoTalk-Chat ein.","Lien copié. Collez-le dans une discussion KakaoTalk.","Link copiato. Incollalo in una chat di KakaoTalk."],
    "♡ 찜": ["♡ Save","♡ 保存","♡ 收藏","♡ Guardar","♡ Lưu","♡ حفظ","♡ Speichern","♡ Enregistrer","♡ Salva"],
    "♥ 찜함": ["♥ Saved","♥ 保存済み","♥ 已收藏","♥ Guardado","♥ Đã lưu","♥ محفوظ","♥ Gespeichert","♥ Enregistré","♥ Salvato"],
    "YouTube에서 보기 ↗": ["Watch on YouTube ↗","YouTubeで見る ↗","在YouTube观看 ↗","Ver en YouTube ↗","Xem trên YouTube ↗","شاهد على يوتيوب ↖","Auf YouTube ansehen ↗","Voir sur YouTube ↗","Guarda su YouTube ↗"],
    "채널 방문 ↗": ["Visit channel ↗","チャンネルへ ↗","访问频道 ↗","Visitar canal ↗","Ghé kênh ↗","زيارة القناة ↖","Kanal besuchen ↗","Voir la chaîne ↗","Visita il canale ↗"],
    "다음 영상": ["Up next","次の動画","接下来播放","A continuación","Tiếp theo","التالي","Als Nächstes","À suivre","Prossimo"],
    "다음 화": ["Next episode","次の話","下一集","Siguiente episodio","Tập tiếp theo","الحلقة التالية","Nächste Folge","Épisode suivant","Episodio successivo"],
    "이전 화": ["Previous episode","前の話","上一集","Episodio anterior","Tập trước","الحلقة السابقة","Vorherige Folge","Épisode précédent","Episodio precedente"],
    "AI 영화 만드는 법": ["How to make AI movies","AI映画の作り方","AI电影制作方法","Cómo hacer películas con IA","Cách làm phim AI","طريقة صنع أفلام الذكاء الاصطناعي","So drehst du KI-Filme","Comment faire des films IA","Come fare film con l'IA"],
    "광고 문의": ["Advertise","広告掲載","广告合作","Publicidad","Quảng cáo","أعلن معنا","Werben","Publicité","Pubblicità"],
    "취소": ["Cancel","キャンセル","取消","Cancelar","Hủy","إلغاء","Abbrechen","Annuler","Annulla"],
    "{n}초 후 재생": ["Playing in {n}s","{n}秒後に再生","{n}秒后播放","Se reproduce en {n} s","Phát sau {n} giây","التشغيل بعد {n} ث","Startet in {n} s","Lecture dans {n} s","Riproduzione tra {n} s"],
    "다음에 볼 만한 작품": ["Watch next","次に見るなら","接下来看什么","Para ver después","Xem tiếp gì","شاهد بعد ذلك","Als Nächstes ansehen","À regarder ensuite","Da guardare dopo"],
    "지금 {n}화예요. 처음 보신다면 1화부터 보면 더 재미있어요.": ["This is episode {n}. New to the series? It's more fun from episode 1.","今は第{n}話です。初めてなら第1話から見るともっと楽しめます。","现在是第{n}集。第一次看的话，从第1集开始更好看。","Este es el episodio {n}. ¿Primera vez? Es mejor desde el episodio 1.","Đây là tập {n}. Lần đầu xem? Xem từ tập 1 sẽ hay hơn.","هذه الحلقة {n}. أول مرة؟ المشاهدة من الحلقة 1 أمتع.","Das ist Folge {n}. Neu bei der Serie? Ab Folge 1 macht es mehr Spaß.","Ceci est l'épisode {n}. Nouveau ? C'est plus captivant depuis l'épisode 1.","Questo è l'episodio {n}. Prima volta? È più bello dall'episodio 1."],
    "다른 영상": ["More videos","その他の動画","更多视频","Más videos","Thêm video","فيديوهات أخرى","Weitere Videos","Plus de vidéos","Altri video"],
    // 검색
    "최근 검색어": ["Recent searches","最近の検索","最近搜索","Búsquedas recientes","Tìm kiếm gần đây","عمليات البحث الأخيرة","Letzte Suchen","Recherches récentes","Ricerche recenti"],
    "전체 삭제": ["Clear all","すべて削除","全部清除","Borrar todo","Xóa tất cả","مسح الكل","Alle löschen","Tout effacer","Cancella tutto"],
    "{q} 삭제": ["Remove {q}","{q}を削除","删除{q}","Quitar {q}","Xóa {q}","إزالة {q}","{q} entfernen","Supprimer {q}","Rimuovi {q}"],
    "인기 영상 TOP 5": ["Top 5 videos","人気動画 TOP 5","热门视频 TOP 5","Top 5 videos","Top 5 video","أفضل 5 فيديوهات","Top 5 Videos","Top 5 des vidéos","Top 5 video"],
    "조회수 기준": ["by views","再生回数順","按观看次数","por visualizaciones","theo lượt xem","حسب المشاهدات","nach Aufrufen","par vues","per visualizzazioni"],
    "인기 채널": ["Popular channels","人気チャンネル","热门频道","Canales populares","Kênh nổi bật","قنوات رائجة","Beliebte Kanäle","Chaînes populaires","Canali popolari"],
    "장르로 찾기": ["Browse by genre","ジャンルで探す","按类型浏览","Explorar por género","Duyệt theo thể loại","تصفّح حسب النوع","Nach Genre stöbern","Parcourir par genre","Sfoglia per genere"],
    "채널": ["Channels","チャンネル","频道","Canales","Kênh","القنوات","Kanäle","Chaînes","Canali"],
    "영상": ["Videos","動画","视频","Videos","Video","الفيديوهات","Videos","Vidéos","Video"],
    "채널 영상 {n}편": ["{n} videos","動画{n}本","{n}个视频","{n} videos","{n} video","{n} فيديو","{n} Videos","{n} vidéos","{n} video"],
    "\"{q}\" 검색 결과 {n}개 모두 보기 ›": ["See all {n} results for \"{q}\" ›","「{q}」の検索結果 {n}件をすべて見る ›","查看“{q}”的全部 {n} 个结果 ›","Ver los {n} resultados de \"{q}\" ›","Xem tất cả {n} kết quả cho \"{q}\" ›","عرض كل النتائج ({n}) لـ \"{q}\" ›","Alle {n} Ergebnisse für „{q}“ ›","Voir les {n} résultats pour « {q} » ›","Vedi tutti i {n} risultati per \"{q}\" ›"],
    "\"{q}\"에 맞는 영상이 없어요. 다른 단어로 찾아보세요.": ["No results for \"{q}\". Try another word.","「{q}」に一致する動画はありません。別の言葉でお試しください。","没有与“{q}”相关的视频，换个词试试。","No hay resultados para \"{q}\". Prueba con otra palabra.","Không có kết quả cho \"{q}\". Hãy thử từ khác.","لا توجد نتائج لـ \"{q}\". جرّب كلمة أخرى.","Keine Ergebnisse für „{q}“. Versuche ein anderes Wort.","Aucun résultat pour « {q} ». Essayez un autre mot.","Nessun risultato per \"{q}\". Prova un'altra parola."],
    // 즐겨찾기·설치
    "All AI-Cinema 바로가기": ["Keep All AI-Cinema handy","All AI-Cinema をすぐ開く","收藏 All AI-Cinema","Ten All AI-Cinema a mano","Giữ All AI-Cinema trong tầm tay","أبقِ All AI-Cinema في متناول يدك","All AI-Cinema immer griffbereit","Gardez All AI-Cinema à portée de main","Tieni All AI-Cinema sempre a portata di mano"],
    "새 AI 영화·드라마가 매일 올라와요. 바로가기를 만들어 두고 편하게 다시 보세요.": ["New AI movies and dramas arrive every day. Add a shortcut to come back anytime.","新しいAI映画・ドラマが毎日追加されます。ショートカットを作っていつでもどうぞ。","每天都有新的AI电影和剧集。添加快捷方式，随时回来观看。","Cada día llegan nuevas películas y series de IA. Crea un acceso directo y vuelve cuando quieras.","Phim và phim bộ AI mới mỗi ngày. Thêm lối tắt để quay lại bất cứ lúc nào.","أفلام ومسلسلات ذكاء اصطناعي جديدة كل يوم. أضف اختصارًا للعودة في أي وقت.","Jeden Tag kommen neue KI-Filme und -Serien. Lege eine Verknüpfung an, um jederzeit zurückzukehren.","De nouveaux films et séries IA arrivent chaque jour. Ajoutez un raccourci pour revenir à tout moment.","Ogni giorno arrivano nuovi film e serie IA. Aggiungi un collegamento per tornare quando vuoi."],
    "홈 화면에 추가하기": ["Add to Home Screen","ホーム画面に追加","添加到主屏幕","Añadir a la pantalla de inicio","Thêm vào màn hình chính","إضافة إلى الشاشة الرئيسية","Zum Startbildschirm","Ajouter à l'écran d'accueil","Aggiungi a Home"],
    "앱으로 설치하기": ["Install app","アプリとしてインストール","安装应用","Instalar app","Cài ứng dụng","تثبيت التطبيق","App installieren","Installer l'app","Installa app"],
    "찜한 영상과 최근 본 영상은 이 기기에만 저장돼요.": ["Your saved and watched videos stay on this device only.","お気に入りと視聴履歴はこの端末にのみ保存されます。","收藏和观看记录仅保存在此设备上。","Tus videos guardados y vistos solo se guardan en este dispositivo.","Video đã lưu và đã xem chỉ được giữ trên thiết bị này.","الفيديوهات المحفوظة والمشاهدة تبقى على هذا الجهاز فقط.","Gespeicherte und gesehene Videos bleiben nur auf diesem Gerät.","Vos vidéos enregistrées et vues restent uniquement sur cet appareil.","I video salvati e visti restano solo su questo dispositivo."],
    "install.inapp": ["You're in an in-app browser, which can't add shortcuts. Open the <b>⋮ / Share</b> menu, choose <b>Open in browser</b>, then try again.","アプリ内ブラウザでは追加できません。<b>⋮ / 共有</b>メニューから<b>他のブラウザで開く</b>を選んで、もう一度お試しください。","应用内浏览器无法添加。请在 <b>⋮ / 分享</b> 菜单中选择<b>在浏览器中打开</b>后重试。","Estás en un navegador dentro de una app y no se pueden añadir accesos directos. Abre el menú <b>⋮ / Compartir</b>, elige <b>Abrir en el navegador</b> y vuelve a intentarlo.","Bạn đang dùng trình duyệt trong ứng dụng nên không thể thêm lối tắt. Mở menu <b>⋮ / Chia sẻ</b>, chọn <b>Mở trong trình duyệt</b> rồi thử lại.","أنت في متصفح داخل تطبيق ولا يمكنه إضافة اختصار. افتح قائمة <b>⋮ / مشاركة</b> واختر <b>فتح في المتصفح</b> ثم حاول مجددًا.","Du bist in einem In-App-Browser, der keine Verknüpfungen anlegen kann. Öffne das Menü <b>⋮ / Teilen</b>, wähle <b>Im Browser öffnen</b> und versuche es erneut.","Vous êtes dans un navigateur intégré qui ne peut pas créer de raccourci. Ouvrez le menu <b>⋮ / Partager</b>, choisissez <b>Ouvrir dans le navigateur</b>, puis réessayez.","Sei in un browser interno all'app che non può creare collegamenti. Apri il menu <b>⋮ / Condividi</b>, scegli <b>Apri nel browser</b> e riprova."],
    "install.ios": ["Tap the <b>Share</b> button {icon} at the bottom (top on iPad).</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.","画面下（iPadは上）の<b>共有</b>ボタン {icon} をタップします。</li><li><b>ホーム画面に追加</b>を選び、<b>追加</b>をタップします。","点击屏幕底部（iPad在顶部）的<b>分享</b>按钮 {icon}。</li><li>选择<b>添加到主屏幕</b>，再点<b>添加</b>。","Toca el botón <b>Compartir</b> {icon} abajo (arriba en iPad).</li><li>Elige <b>Añadir a pantalla de inicio</b> y luego <b>Añadir</b>.","Nhấn nút <b>Chia sẻ</b> {icon} ở phía dưới (phía trên trên iPad).</li><li>Chọn <b>Thêm vào MH chính</b>, rồi <b>Thêm</b>.","اضغط زر <b>المشاركة</b> {icon} في الأسفل (في الأعلى على iPad).</li><li>اختر <b>إضافة إلى الشاشة الرئيسية</b> ثم <b>إضافة</b>.","Tippe unten (beim iPad oben) auf <b>Teilen</b> {icon}.</li><li>Wähle <b>Zum Home-Bildschirm</b> und dann <b>Hinzufügen</b>.","Touchez le bouton <b>Partager</b> {icon} en bas (en haut sur iPad).</li><li>Choisissez <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.","Tocca il pulsante <b>Condividi</b> {icon} in basso (in alto su iPad).</li><li>Scegli <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>."],
    "install.android": ["Open the browser menu <b>⋮</b> and choose <b>Add to Home screen</b> or <b>Install app</b>.","ブラウザのメニュー <b>⋮</b> から<b>ホーム画面に追加</b>または<b>アプリをインストール</b>を選びます。","在浏览器菜单 <b>⋮</b> 中选择<b>添加到主屏幕</b>或<b>安装应用</b>。","Abre el menú del navegador <b>⋮</b> y elige <b>Añadir a pantalla de inicio</b> o <b>Instalar app</b>.","Mở menu trình duyệt <b>⋮</b> và chọn <b>Thêm vào màn hình chính</b> hoặc <b>Cài đặt ứng dụng</b>.","افتح قائمة المتصفح <b>⋮</b> واختر <b>إضافة إلى الشاشة الرئيسية</b> أو <b>تثبيت التطبيق</b>.","Öffne das Browsermenü <b>⋮</b> und wähle <b>Zum Startbildschirm hinzufügen</b> oder <b>App installieren</b>.","Ouvrez le menu du navigateur <b>⋮</b> et choisissez <b>Ajouter à l'écran d'accueil</b> ou <b>Installer l'application</b>.","Apri il menu del browser <b>⋮</b> e scegli <b>Aggiungi a schermata Home</b> o <b>Installa app</b>."],
    "install.pc": ["Press {keys} to <b>bookmark</b> this site.","{keys} を押すと<b>ブックマーク</b>に追加されます。","按 {keys} 即可<b>收藏</b>本站。","Pulsa {keys} para <b>guardar en marcadores</b> este sitio.","Nhấn {keys} để <b>đánh dấu</b> trang này.","اضغط {keys} لإضافة هذا الموقع إلى <b>المفضلة</b>.","Drücke {keys}, um diese Seite als <b>Lesezeichen</b> zu speichern.","Appuyez sur {keys} pour ajouter ce site aux <b>favoris</b>.","Premi {keys} per aggiungere il sito ai <b>preferiti</b>."],
    "홈 화면에 All AI-Cinema 추가": ["Add All AI-Cinema to your Home Screen","ホーム画面に All AI-Cinema を追加","将 All AI-Cinema 添加到主屏幕","Añade All AI-Cinema a tu pantalla de inicio","Thêm All AI-Cinema vào màn hình chính","أضف All AI-Cinema إلى الشاشة الرئيسية","All AI-Cinema zum Startbildschirm hinzufügen","Ajoutez All AI-Cinema à votre écran d'accueil","Aggiungi All AI-Cinema alla schermata Home"],
    "앱처럼 한 번에 열고, 새 AI 드라마를 바로 확인하세요.": ["Open it like an app and catch new AI dramas instantly.","アプリのようにすぐ開いて、新しいAIドラマをチェック。","像应用一样一键打开，第一时间看新AI剧。","Ábrelo como una app y descubre al instante las nuevas series de IA.","Mở như một ứng dụng và xem ngay phim AI mới.","افتحه كتطبيق وتابع مسلسلات الذكاء الاصطناعي الجديدة فورًا.","Öffne es wie eine App und verpasse keine neue KI-Serie.","Ouvrez-le comme une app et découvrez les nouvelles séries IA en un instant.","Aprilo come un'app e scopri subito le nuove serie IA."],
    "추가": ["Add","追加","添加","Añadir","Thêm","إضافة","Hinzufügen","Ajouter","Aggiungi"],
    "안내 닫기": ["Dismiss","閉じる","关闭","Descartar","Bỏ qua","تجاهل","Schließen","Ignorer","Chiudi"],
    // 바닥글
    "footer.rights": ["All videos are copyrighted by their YouTube channels and creators, and play through the official YouTube player.<br />To request removal of a video, use the contact on the About page.","すべての動画の著作権は各YouTubeチャンネルと制作者に帰属し、YouTube公式プレーヤーで再生されます。<br />掲載停止のご依頼は「サイトについて」の連絡先までお送りください。","所有视频的版权归各YouTube频道及创作者所有，本站通过YouTube官方播放器播放。<br />如需下架视频，请通过“关于”页面中的联系方式与我们联系。","Todos los videos pertenecen a sus canales de YouTube y creadores, y se reproducen con el reproductor oficial de YouTube.<br />Para solicitar la retirada de un video, usa el contacto de la página Acerca de.","Mọi video thuộc bản quyền của kênh YouTube và nhà sáng tạo, phát qua trình phát YouTube chính thức.<br />Để yêu cầu gỡ video, hãy dùng liên hệ ở trang Giới thiệu.","جميع الفيديوهات محفوظة الحقوق لقنوات يوتيوب ومبدعيها، وتُعرض عبر مشغّل يوتيوب الرسمي.<br />لطلب إزالة فيديو، استخدم وسيلة التواصل في صفحة «من نحن».","Alle Videos sind urheberrechtlich durch ihre YouTube-Kanäle und Ersteller geschützt und werden über den offiziellen YouTube-Player abgespielt.<br />Für die Entfernung eines Videos nutze den Kontakt auf der Seite „Über uns“.","Toutes les vidéos appartiennent à leurs chaînes YouTube et créateurs, et sont lues via le lecteur YouTube officiel.<br />Pour demander le retrait d'une vidéo, utilisez le contact de la page À propos.","Tutti i video sono protetti dal diritto d'autore dei rispettivi canali YouTube e creatori e vengono riprodotti con il player ufficiale di YouTube.<br />Per chiedere la rimozione di un video, usa il contatto nella pagina Chi siamo."],
    "소개": ["About","サイトについて","关于","Acerca de","Giới thiệu","من نحن","Über uns","À propos","Chi siamo"],
    "개인정보처리방침": ["Privacy","プライバシー","隐私政策","Privacidad","Quyền riêng tư","الخصوصية","Datenschutz","Confidentialité","Privacy"],
    "이용약관": ["Terms","利用規約","使用条款","Términos","Điều khoản","الشروط","Nutzungsbedingungen","Conditions","Termini"],
    // 시간
    "방금": ["just now","たった今","刚刚","ahora mismo","vừa xong","الآن","gerade eben","à l'instant","proprio ora"],
    // 장르·국가 (관리자 카테고리 이름)
    "액션·히어로": ["Action & Heroes","アクション・ヒーロー","动作·英雄","Acción y héroes","Hành động & Siêu anh hùng","أكشن وأبطال خارقون","Action & Helden","Action & héros","Azione & eroi"],
    "판타지": ["Fantasy","ファンタジー","奇幻","Fantasía","Giả tưởng","فانتازيا","Fantasy","Fantastique","Fantasy"],
    "사극·무협": ["Historical & Martial Arts","時代劇・武侠","古装·武侠","Histórico y artes marciales","Cổ trang & Võ hiệp","تاريخي وفنون قتالية","Historisch & Kampfkunst","Historique & arts martiaux","Storico & arti marziali"],
    "SF": ["Sci-Fi","SF","科幻","Ciencia ficción","Khoa học viễn tưởng","خيال علمي","Sci-Fi","Science-fiction","Fantascienza"],
    "미스터리·스릴러": ["Mystery & Thriller","ミステリー・スリラー","悬疑·惊悚","Misterio y suspense","Bí ẩn & Giật gân","غموض وإثارة","Mystery & Thriller","Mystère & thriller","Mistero & thriller"],
    "코미디": ["Comedy","コメディ","喜剧","Comedia","Hài","كوميديا","Komödie","Comédie","Commedia"],
    "드라마": ["Drama","ドラマ","剧情","Drama","Chính kịch","دراما","Drama","Drame","Drammatico"],
    "로맨스": ["Romance","ロマンス","爱情","Romance","Lãng mạn","رومانسي","Romantik","Romance","Romantico"],
    "공포": ["Horror","ホラー","恐怖","Terror","Kinh dị","رعب","Horror","Horreur","Horror"],
    "스릴러": ["Thriller","スリラー","惊悚","Suspense","Giật gân","إثارة","Thriller","Thriller","Thriller"],
    "애니메이션": ["Animation","アニメ","动画","Animación","Hoạt hình","رسوم متحركة","Animation","Animation","Animazione"],
    "AI 드라마": ["AI Drama","AIドラマ","AI剧集","Serie de IA","Phim bộ AI","دراما بالذكاء الاصطناعي","KI-Serie","Série IA","Serie IA"],
    "AI 영화": ["AI Movie","AI映画","AI电影","Película de IA","Phim AI","فيلم بالذكاء الاصطناعي","KI-Film","Film IA","Film IA"],
    "AI 단편": ["AI Short Film","AI短編","AI短片","Cortometraje de IA","Phim ngắn AI","فيلم قصير بالذكاء الاصطناعي","KI-Kurzfilm","Court métrage IA","Cortometraggio IA"],
    "기타": ["Other","その他","其他","Otros","Khác","أخرى","Sonstiges","Autres","Altro"],
    "한국": ["Korea","韓国","韩国","Corea","Hàn Quốc","كوريا","Korea","Corée","Corea"],
    "미국": ["USA","アメリカ","美国","EE. UU.","Mỹ","الولايات المتحدة","USA","États-Unis","USA"],
    "일본": ["Japan","日本","日本","Japón","Nhật Bản","اليابان","Japan","Japon","Giappone"],
    "중국": ["China","中国","中国","China","Trung Quốc","الصين","China","Chine","Cina"],
    "대만": ["Taiwan","台湾","台湾","Taiwán","Đài Loan","تايوان","Taiwan","Taïwan","Taiwan"],
    "홍콩": ["Hong Kong","香港","香港","Hong Kong","Hồng Kông","هونغ كونغ","Hongkong","Hong Kong","Hong Kong"],
    "태국": ["Thailand","タイ","泰国","Tailandia","Thái Lan","تايلاند","Thailand","Thaïlande","Thailandia"],
    "베트남": ["Vietnam","ベトナム","越南","Vietnam","Việt Nam","فيتنام","Vietnam","Vietnam","Vietnam"],
    "인도네시아": ["Indonesia","インドネシア","印度尼西亚","Indonesia","Indonesia","إندونيسيا","Indonesien","Indonésie","Indonesia"],
    "필리핀": ["Philippines","フィリピン","菲律宾","Filipinas","Philippines","الفلبين","Philippinen","Philippines","Filippine"],
    "인도": ["India","インド","印度","India","Ấn Độ","الهند","Indien","Inde","India"],
    "영국": ["UK","イギリス","英国","Reino Unido","Anh","المملكة المتحدة","Großbritannien","Royaume-Uni","Regno Unito"],
    "프랑스": ["France","フランス","法国","Francia","Pháp","فرنسا","Frankreich","France","Francia"],
    "독일": ["Germany","ドイツ","德国","Alemania","Đức","ألمانيا","Deutschland","Allemagne","Germania"],
    "스페인": ["Spain","スペイン","西班牙","España","Tây Ban Nha","إسبانيا","Spanien","Espagne","Spagna"],
    "이탈리아": ["Italy","イタリア","意大利","Italia","Ý","إيطاليا","Italien","Italie","Italia"],
    "러시아": ["Russia","ロシア","俄罗斯","Rusia","Nga","روسيا","Russland","Russie","Russia"],
    "캐나다": ["Canada","カナダ","加拿大","Canadá","Canada","كندا","Kanada","Canada","Canada"],
    "호주": ["Australia","オーストラリア","澳大利亚","Australia","Úc","أستراليا","Australien","Australie","Australia"],
    "브라질": ["Brazil","ブラジル","巴西","Brasil","Brazil","البرازيل","Brasilien","Brésil","Brasile"],
    "멕시코": ["Mexico","メキシコ","墨西哥","México","Mexico","المكسيك","Mexiko","Mexique","Messico"],
    "해외": ["International","海外","海外","Internacional","Quốc tế","دولي","International","International","Internazionale"],
    "글로벌": ["Global","グローバル","全球","Global","Toàn cầu","عالمي","Global","Mondial","Globale"],
  };
  const IDX = { en: 0, ja: 1, zh: 2, es: 3, vi: 4, ar: 5, de: 6, fr: 7, it: 8 };

  // ── 접속 국가 → 언어 ──
  const IS_BOT = /bot|crawl|spider|slurp|lighthouse|yeti|daum/i.test(navigator.userAgent || "");
  const ES_CC = "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ".split(" ");
  // 아랍어권 (아랍연맹 회원국)
  const AR_CC = "SA AE EG IQ JO KW LB LY MA OM QA SY TN YE BH DZ SD PS MR SO DJ KM".split(" ");
  // 독일어권 · 프랑스어권(프랑스·벨기에·룩셈부르크·모나코·프랑스어권 아프리카) · 이탈리아어권 (캐나다·스위스 등 다언어 국가는 영어/독일어)
  const DE_CC = "DE AT CH LI".split(" ");
  const FR_CC = "FR BE LU MC SN CI CM ML BF NE TG BJ GA CG CD MG HT RE GP MQ GF YT NC PF".split(" ");
  const IT_CC = "IT SM VA".split(" ");
  const fromCountry = (cc) => {
    cc = String(cc || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return "";
    if (cc === "KR") return "ko";
    if (cc === "JP") return "ja";
    if (["CN", "TW", "HK", "MO"].includes(cc)) return "zh";
    if (ES_CC.includes(cc)) return "es";
    if (cc === "VN") return "vi";
    if (AR_CC.includes(cc)) return "ar";
    if (DE_CC.includes(cc)) return "de";
    if (FR_CC.includes(cc)) return "fr";
    if (IT_CC.includes(cc)) return "it";
    return "en";   // 미국·영국·싱가포르 등 그 밖의 나라
  };
  // 시간대로 미리 짐작 (IP 확인 결과가 오기 전 첫 화면용)
  function fromTimeZone() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    if (!tz) return "";
    if (tz === "Asia/Seoul") return "ko";
    if (tz === "Asia/Tokyo") return "ja";
    if (/^Asia\/(Shanghai|Chongqing|Chungking|Harbin|Urumqi|Kashgar|Hong_Kong|Macau|Taipei)$|^PRC$|^ROC$/.test(tz)) return "zh";
    if (/^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta|America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana|Argentina\/.+|Buenos_Aires|Bogota|Santiago|Punta_Arenas|Lima|Caracas|Guayaquil|Guatemala|Havana|La_Paz|Santo_Domingo|Tegucigalpa|Asuncion|El_Salvador|Managua|Costa_Rica|Panama|Montevideo|Puerto_Rico)|Pacific\/Galapagos|Africa\/Malabo)$/.test(tz)) return "es";
    if (/^Asia\/(Ho_Chi_Minh|Saigon)$/.test(tz)) return "vi";
    if (/^(Asia\/(Riyadh|Dubai|Baghdad|Kuwait|Qatar|Bahrain|Muscat|Amman|Beirut|Damascus|Aden|Gaza|Hebron)|Africa\/(Cairo|Casablanca|El_Aaiun|Algiers|Tunis|Tripoli|Khartoum|Nouakchott|Mogadishu|Djibouti))$/.test(tz)) return "ar";
    if (/^Europe\/(Berlin|Busingen|Vienna|Zurich|Vaduz)$/.test(tz)) return "de";
    if (/^(Europe\/(Paris|Brussels|Luxembourg|Monaco)|Africa\/(Dakar|Abidjan|Douala|Bamako|Ouagadougou|Niamey|Lome|Porto-Novo|Libreville|Brazzaville|Kinshasa|Lubumbashi)|Indian\/(Antananarivo|Reunion|Mayotte)|America\/(Port-au-Prince|Guadeloupe|Martinique|Cayenne)|Pacific\/(Noumea|Tahiti))$/.test(tz)) return "fr";
    if (/^Europe\/(Rome|San_Marino|Vatican)$/.test(tz)) return "it";
    if (/^(America|Europe|Australia|Pacific|Atlantic|Africa|Indian)\//.test(tz) || /^Asia\/(Singapore|Kolkata|Calcutta|Manila|Kuala_Lumpur|Jakarta|Bangkok|Karachi|Dhaka)$/.test(tz)) return "en";
    return "";
  }
  const GEO_KEY = "aic:geo", GEO_TTL = 7 * 86400000;
  // 방문자 국가 코드 (띠 배너 국내/해외 구분용): IP 확인 결과 → 없으면 시간대로 짐작 (한국 시간대면 KR)
  function visitorCountry() {
    try { const g = JSON.parse(localStorage.getItem(GEO_KEY) || "null"); if (g && /^[A-Z]{2}$/.test(g.c)) return g.c; } catch {}
    try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Seoul") return "KR"; } catch {}
    return "";
  }
  function cachedGeo() {
    try { const g = JSON.parse(localStorage.getItem(GEO_KEY) || "null"); if (g && Date.now() - g.t < GEO_TTL) return fromCountry(g.c); } catch {}
    return "";
  }
  // IP로 국가 확인 (국가 코드만 받고, 브라우저에 7일 보관 · 서버에는 저장하지 않음)
  async function lookupCountry() {
    const tries = [
      ["https://get.geojs.io/v1/ip/country", (r) => r.text()],
      ["https://api.country.is/", (r) => r.json().then((j) => j && j.country)],
    ];
    for (const [url, read] of tries) {
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 2500);
        const res = await fetch(url, { signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
        clearTimeout(tm);
        if (!res.ok) continue;
        const cc = String(await read(res) || "").trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(cc)) return cc;
      } catch {}
    }
    return "";
  }

  // ── 언어 정하기 ──
  function detect() {
    try { const q = new URLSearchParams(location.search).get("lang"); if (CODES.includes(q)) return q; } catch {}
    // 언어별 주소 (/en/ /ja/ /zh/ /es/ /vi/ /ar/ /de/ /fr/ /it/) → 그 언어로 고정 (검색엔진이 언어별 페이지를 따로 색인)
    const m = location.pathname.match(/^\/(en|ja|zh|es|vi|ar|de|fr|it)(\/|$)/); if (m) return m[1];
    try { const s = localStorage.getItem("aic:lang"); if (CODES.includes(s)) return s; } catch {}
    // 기본 주소(/)는 검색 로봇에게 항상 한국어로 (언어별 페이지는 hreflang 으로 따로 알려 줌)
    if (IS_BOT) return "ko";
    // 접속 위치(IP 국가) 우선: 저장해 둔 국가 → 기기 시간대(바로 판단, 깜빡임 없음) → 브라우저 언어
    const g = cachedGeo(); if (g) return g;
    const z = fromTimeZone(); if (z) return z;
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "ko";
    const p = nav.toLowerCase().slice(0, 2);
    return CODES.includes(p) ? p : (p === "ko" ? "ko" : "en");   // 지원하지 않는 언어는 영어
  }
  let lang = detect();

  // 기본 주소(/)이고 사용자가 직접 고른 언어가 없으면 IP 국가를 확인해서 맞춰 줌
  let geoCode = "", geoCbs = [];
  (function geo() {
    let picked = null; try { picked = localStorage.getItem("aic:lang"); } catch {}
    const fixed = /[?&]lang=/.test(location.search) || /^\/(en|ja|zh|es|vi|ar|de|fr|it)(\/|$)/.test(location.pathname);
    if (IS_BOT || fixed || CODES.includes(picked) || cachedGeo() || typeof fetch !== "function") return;
    lookupCountry().then((cc) => {
      if (!cc) return;
      try { localStorage.setItem(GEO_KEY, JSON.stringify({ c: cc, t: Date.now() })); } catch {}
      geoCode = fromCountry(cc);
      if (geoCode && geoCode !== lang) for (const cb of geoCbs) cb(geoCode);
    });
  })();
  // 앱이 "IP로 정한 언어"를 받아 화면을 다시 그릴 수 있게
  const onGeo = (cb) => { geoCbs.push(cb); if (geoCode && geoCode !== lang) cb(geoCode); };

  function t(ko, vars) {
    let s = ko;
    if (lang !== "ko" && D[ko]) s = D[ko][IDX[lang]] || ko;
    else if (lang === "ko" && /^[a-z]+\.[a-z]+$/.test(ko)) s = KO_LONG[ko] || ko;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  }
  // 긴 문구 (키로 쓰는 것) 의 한국어 원문
  const KO_LONG = {
    "install.inapp": "지금은 앱 안의 브라우저라 추가할 수 없어요. 오른쪽 위(또는 아래) <b>⋮ / 공유</b> 메뉴에서 <b>다른 브라우저로 열기</b>를 누른 뒤 다시 시도해 주세요.",
    "install.ios": "화면 아래(아이패드는 위) <b>공유 버튼</b> {icon} 을 눌러요.</li><li>목록에서 <b>홈 화면에 추가</b>를 누르고 <b>추가</b>를 눌러요.",
    "install.android": "브라우저 메뉴 <b>⋮</b> 에서 <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요.",
    "install.pc": "키보드에서 {keys} 를 누르면 <b>즐겨찾기(북마크)</b>에 추가돼요.",
    "footer.rights": "모든 영상의 저작권은 각 유튜브 채널과 제작자에게 있으며, 본 사이트는 YouTube 공식 플레이어로 재생합니다.<br />영상 게시 중단 요청은 소개 페이지의 연락처로 보내주세요.",
  };
  // 장르·국가 이름 (사전에 없으면 원래 이름)
  const name = (s) => (lang === "ko" || !D[s] ? s : D[s][IDX[lang]] || s);

  // 조회수: 한국어 1.2만회 / English 12K / 日本語 1.2万 / 中文 1.2万
  let nf = null;
  const compact = (n) => {
    try { nf = nf || new Intl.NumberFormat(LANGS.find((l) => l.code === lang).html, { notation: "compact", maximumFractionDigits: 1 }); return nf.format(n); }
    catch { return String(n); }
  };
  const views = (n) => (n ? t("조회수 {n}회", { n: compact(n) }) : "");
  const viewsShort = (n) => (n ? compact(n) : "");   // "조회수 " 없이 숫자만 (작품 카드 등)

  // 몇 분 전: Intl.RelativeTimeFormat
  let rtf = null;
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (!(s >= 0)) return "";
    try { rtf = rtf || new Intl.RelativeTimeFormat(LANGS.find((l) => l.code === lang).html, { numeric: "auto" }); } catch { rtf = null; }
    const u = s < 3600 ? ["minute", Math.max(1, Math.floor(s / 60))] : s < 86400 ? ["hour", Math.floor(s / 3600)]
      : s < 2592000 ? ["day", Math.floor(s / 86400)] : s < 31536000 ? ["month", Math.floor(s / 2592000)] : ["year", Math.floor(s / 31536000)];
    return rtf ? rtf.format(-u[1], u[0]) : `${u[1]} ${u[0]} ago`;
  }

  // ── 정적 HTML 번역: data-i18n(글자) / data-i18n-html(태그 포함) / data-i18n-attr="placeholder,aria-label,title" ──
  function applyStatic(root = document) {
    for (const el of root.querySelectorAll("[data-i18n]")) {
      if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.dataset.i18n || el.textContent.trim();
      el.textContent = t(el.dataset.i18nSrc);
    }
    for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);   // 사전의 고정 문구만 (외부 입력 아님)
    for (const el of root.querySelectorAll("[data-i18n-attr]")) {
      for (const a of el.dataset.i18nAttr.split(",")) {
        const key = "i18nSrc" + a.replace(/(^|-)(\w)/g, (m, d, c) => c.toUpperCase());
        if (!(key in el.dataset)) el.dataset[key] = el.getAttribute(a) || "";
        el.setAttribute(a, t(el.dataset[key]));
      }
    }
    const L = LANGS.find((l) => l.code === lang);
    document.documentElement.lang = L.html;
    document.documentElement.dir = L.rtl ? "rtl" : "ltr";   // 아랍어는 오른쪽→왼쪽
  }

  function setLang(code, persist = true) {   // persist=false: 자동으로 정한 언어 (사용자 선택으로 기억하지 않음)
    if (!CODES.includes(code) || code === lang) return false;
    lang = code; nf = null; rtf = null;
    if (persist) try { localStorage.setItem("aic:lang", code); } catch {}
    applyStatic();
    return true;
  }

  window.AIC_I18N = {
    LANGS, t, name, views, viewsShort, ago, applyStatic, setLang, onGeo, country: visitorCountry,
    get lang() { return lang; },
    get meta() { return LANGS.find((l) => l.code === lang); },
  };
})();

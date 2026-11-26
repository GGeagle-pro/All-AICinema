// 사이트 소개 페이지 /intro/ (한국어) – 검색광고 랜딩용, 광고(애드센스·띠 배너) 없음
//  - 자체 작성 글: 사이트가 하는 일, 작품 선정 기준, 장르 가이드, 에디터 추천(작품 소개), 이용 방법, 운영 정보
//  - 숫자(편수·채널 수)·주간 TOP 3·장르별 편수는 수집 때마다 자동 갱신
//  - 에디터 추천 글: site.json workNotes("채널 / 작품")에 관리자가 쓴 글이 있으면 그 글을, 없으면 아래 PICKS 기본 소개를 씀
//  - seo.mjs 가 호출
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { shell, esc, loadAll } from "./pages.mjs";
import { GENRE_SLUG } from "./genre.mjs";

// 기본 에디터 추천 (작품 키 "채널 / 작품") – 관리자 작품 탭의 에디터 노트로 언제든 바꿀 수 있음
const PICKS = [
  ["씬나루 AI Studio / 장군님 출근하십니다", "조선의 장군이 돈을 벌러 현대 회사에 나타나는 설정의 사극 코미디예요. 1화 '과거에서 돈 벌러 왔습니다'부터 상황이 계속 꼬이는데, 장군의 말투와 현대 직장 문화가 부딪히는 장면이 웃음 포인트예요. 한 편이 짧아 출퇴근길에 한두 편씩 보기 좋아요."],
  ["씨네트릭스 / 중세에 티타늄 수트를 입음", "중세 기사가 티타늄 수트를 '장착'하면서 벌어지는 판타지 액션 시리즈예요. 회차 제목(장착, 기연…)처럼 게임 성장물 같은 전개라, 웹소설을 좋아하는 분께 특히 추천해요. 1화부터 순서대로 보는 걸 권해요."],
  ["통쾌다방 / 국밥 할머니 (", "국밥집 할머니와 재벌 사위의 갈등을 그린 '사이다' 드라마예요. 매 화 억울한 상황이 쌓였다가 한 번에 풀리는 구성이라 짧은 시간에 몰입하기 좋아요. 최근 매일같이 새 화가 올라오고 있어요."],
  ["드라곤씨네마 / FALL 707: REBOOT", "707 특임대 대위가 폭발 사고로 조선에 떨어진다는 설정의 액션 시대극이에요. 시즌 2까지 이어질 만큼 회차가 많아서 정주행할 작품을 찾는 분께 맞아요. 시즌 1 몰아보기 영상으로 먼저 분위기를 보셔도 좋아요."],
  ["오늘도, 살아갑니다 / 콜제로", "출소 후 조용히 살고 싶었던 주인공이 살인 누명의 진실을 쫓는 범죄 드라마예요. 회차마다 사건의 실마리가 하나씩 풀리는 구성이라, 액션보다 줄거리를 따라가는 걸 좋아하는 분께 추천해요."],
  ["뚜라셀 / 글로리아 판타지아", "RPG 게임 속 모험을 그대로 옮긴 듯한 판타지 애니메이션 시리즈예요. '내 생에 첫 파이어볼' 같은 회차처럼 주인공이 하나씩 성장해 가는 재미가 있어요. 게임 좋아하는 분이라면 익숙한 설정이라 가볍게 보기 좋아요."],
];
const GENRE_GUIDE = {
  "드라마": "현실 배경의 가족·직장·복수 이야기. 짧은 회차에 반전을 담은 '사이다' 드라마가 많아요.",
  "판타지": "마법·이세계·게임 세계관. AI가 만든 영상미가 가장 잘 드러나는 장르예요.",
  "액션·히어로": "격투·전쟁·초능력. 짧은 시간 안에 볼거리가 몰려 있어요.",
  "로맨스": "첫사랑부터 계약 연애까지, 감정선 중심의 이야기.",
  "사극·무협": "조선·무림·고대 배경. 현대인이 과거로 가는 타임슬립물이 인기예요.",
  "SF": "우주·로봇·미래 도시. 실사로는 비싼 장면을 AI로 만든 작품이 많아요.",
  "공포": "괴담·심령·괴물. 밤에 보기 좋은 짧은 공포물.",
  "미스터리·스릴러": "추리·범죄·반전. 끝까지 봐야 풀리는 이야기.",
  "코미디": "가볍게 웃고 싶을 때. 설정 하나로 끝까지 밀어붙이는 작품이 많아요.",
  "애니메이션": "실사가 아닌 그림체로 만든 AI 애니메이션.",
};

async function writeIfChanged(file, text) {
  try { if ((await readFile(file, "utf8")) === text) return false; } catch {}
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file + ".tmp", text); await rename(file + ".tmp", file);
  return true;
}

export async function buildIntro({ PUB, SITE, loadI18n, ver, pagesOn = true }) {
  let site = {};
  try { site = JSON.parse(await readFile(resolve(PUB, "data/site.json"), "utf8")); } catch {}
  const { videos, works } = await loadAll(PUB);
  const I = await loadI18n("ko");
  const notes = site.workNotes || {};
  const channels = new Set(videos.map((v) => v.channel)).size;
  const floor = (n) => (n >= 1000 ? Math.floor(n / 100) * 100 : n);
  const week = videos.filter((v) => Date.now() - Date.parse(v.published) < 7 * 864e5).length;
  const byKey = new Map(works.map((w) => [`${w.channel} / ${w.name}`, w]));
  const workUrl = (w) => (pagesOn ? `/work/${w.slug}/` : `/?w=${encodeURIComponent(w.name)}`);
  // 에디터 추천: 관리자 노트가 있는 작품 먼저, 그다음 기본 추천
  const noteText = (k) => (typeof notes[k] === "string" ? notes[k] : notes[k]?.ko) || "";
  const picks = [...Object.keys(notes).filter((k) => byKey.has(k) && noteText(k)).map((k) => [k, noteText(k)]), ...PICKS.filter(([k]) => byKey.has(k) && !noteText(k))].slice(0, 8);
  // 이번 주 많이 본 한국 작품 3편 (소개 페이지는 한국어 방문자용)
  const top = videos.filter((v) => v.categories.includes("한국") && Date.now() - Date.parse(v.published) < 7 * 864e5).sort((a, b) => b.views - a.views).slice(0, 3);
  const genres = Object.keys(GENRE_GUIDE).map((g) => ({ g, n: videos.filter((v) => v.categories.includes(g)).length })).filter((x) => x.n >= 12);
  const url = `${SITE}/intro/`;
  const title = "All AI-Cinema 소개 – AI로 만든 영화·드라마를 골라 모아 보는 곳";
  const desc = `유튜브에 흩어진 AI 영화·드라마 ${floor(videos.length).toLocaleString()}편 이상을 장르·나라·시리즈별로 정리했어요. 작품 선정 기준, 에디터 추천, 장르 가이드, 운영 정보를 소개합니다.`;
  const body = `    <nav class="pg-crumbs" aria-label="breadcrumb"><a href="/">홈</a> › <span>소개</span></nav>
    <h1 class="pg-title">AI로 만든 영화·드라마, 볼 만한 것만 골라 정리했어요</h1>
    <p class="pg-desc">요즘 유튜브에는 생성형 AI로 만든 영화·드라마·단편이 하루에도 수십 편씩 올라와요. 그런데 채널이 흩어져 있고, 시리즈는 1화가 어디 있는지 찾기도 어렵죠. All AI-Cinema는 이런 작품을 찾아 장르·나라·시리즈별로 정리해, 처음 보는 분도 바로 고를 수 있게 만든 큐레이션 사이트예요.</p>

    <section class="pg-sec"><h2>All AI-Cinema가 하는 일</h2>
      <ul>
        <li><b>찾기</b> – AI 영상을 꾸준히 올리는 유튜브 채널 ${channels}곳을 골라 등록하고, 새 영상을 2시간마다 확인해요. 지금까지 ${floor(videos.length).toLocaleString()}편 이상, 최근 7일 동안 ${week}편이 새로 들어왔어요.</li>
        <li><b>정리하기</b> – 영상마다 장르와 제작 나라를 정하고, 같은 작품의 회차를 묶어 <b>1화부터 순서대로</b> 볼 수 있게 시리즈(${works.length}개)로 정리해요.</li>
        <li><b>골라 주기</b> – 매주 가장 많이 본 작품을 <a href="/top/">주간 TOP 10</a>으로, 장르별로는 <a href="/genre/">장르별 모음</a>으로 보여 드려요. 시리즈마다 언제부터 몇 화까지 나왔는지, 요즘 반응이 어떤지도 함께 적어요.</li>
      </ul>
    </section>

    <section class="pg-sec"><h2>작품을 고르는 기준</h2>
      <ol>
        <li><b>제작자가 외부 재생을 허용한 공개 영상만</b> 보여 줘요. 외부 재생을 막았거나 비공개·삭제된 영상은 매일 확인해서 자동으로 빼요.</li>
        <li><b>AI로 만든 이야기 영상</b>(영화·드라마·단편·애니메이션)을 중심으로 골라요. 게임 플레이 영상이나 단순 소개 영상은 등록하지 않아요.</li>
        <li><b>영상은 유튜브 공식 플레이어로 재생</b>돼요. 조회수와 수익은 원래 채널에 그대로 쌓이고, 재생 화면에서 원본 영상과 채널로 바로 갈 수 있어요.</li>
        <li><b>권리자가 원하지 않으면 바로 내려요.</b> 아래 연락처로 영상이나 채널 주소를 보내 주시면 확인 후 목록에서 제외해요.</li>
        <li>어린이용으로 지정된 영상은 통계·광고 추적 없이 보여 줘요.</li>
      </ol>
    </section>

    ${picks.length ? `<section class="pg-sec"><h2>에디터 추천</h2>
      <p class="muted">처음 오신 분께 권하는 시리즈예요. 각 작품 페이지에서 1화부터 이어 볼 수 있어요.</p>
      ${picks.map(([k, txt]) => { const w = byKey.get(k); return `<div class="intro-pick"><h3><a href="${workUrl(w)}">${esc(w.name.replace(/\s*\($/, ""))}</a> <small class="muted">${esc(w.channel)} · ${w.list.length}화</small></h3><p>${esc(txt)}</p></div>`; }).join("\n      ")}
    </section>` : ""}

    <section class="pg-sec"><h2>장르 가이드</h2>
      <dl class="intro-genres">${genres.map(({ g, n }) => `<dt><a href="/genre/${GENRE_SLUG[g]}/">${esc(I.name(g))}</a> <small class="muted">${n.toLocaleString()}편</small></dt><dd>${esc(GENRE_GUIDE[g])}</dd>`).join("")}</dl>
    </section>

    ${top.length ? `<section class="pg-sec"><h2>이번 주 많이 본 한국 AI 작품</h2><ol>${top.map((v) => `<li><a href="${pagesOn ? `/watch/${v.id}/` : `/?v=${v.id}`}">${esc(v.title)}</a> <small class="muted">${esc(v.channel)}</small></li>`).join("")}</ol><p><a href="/top/">주간 TOP 10 전체 보기 →</a></p></section>` : ""}

    <section class="pg-sec"><h2>이렇게 이용하세요</h2>
      <ul>
        <li>회원가입 없이 무료로 볼 수 있어요.</li>
        <li>보던 영상은 다음에 들어왔을 때 <b>이어보기</b>로 그 자리부터 다시 볼 수 있어요(기기에만 저장).</li>
        <li>휴대폰에서는 홈 화면에 추가하면 앱처럼 쓸 수 있어요.</li>
        <li>한국어·영어·일본어·중국어·스페인어로 볼 수 있어요.</li>
      </ul>
    </section>

    <section class="pg-sec"><h2>운영 정보</h2>
      <dl class="intro-info">
        <dt>사이트</dt><dd>All AI-Cinema (all-aicinema.syncbrain100.com)</dd>
        <dt>운영</dt><dd>개인 운영</dd>
        <dt>연락·게시 중단 요청</dt><dd>champkj79@gmail.com</dd>
        <dt>영상 저작권</dt><dd>모든 영상과 썸네일의 저작권은 각 유튜브 채널과 제작자에게 있어요. 본 사이트는 영상을 복제·저장·편집하지 않아요.</dd>
        <dt>정책</dt><dd><a href="/about.html">사이트 소개·저작권 정책</a> · <a href="/privacy.html">개인정보처리방침</a></dd>
      </dl>
    </section>
    <p class="pg-all"><a class="btn btn--primary" href="/">AI 영화·드라마 보러 가기 →</a></p>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "AboutPage", name: title, url, description: desc, inLanguage: "ko-KR",
      about: { "@type": "WebSite", name: "All AI-Cinema", url: SITE + "/" } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "홈", item: SITE + "/" }, { "@type": "ListItem", position: 2, name: "소개", item: url }] },
  ];
  const html = shell({ lang: "ko", title, desc, url, image: `${SITE}/og-image.jpg?v=3`, ogType: "website", ld, body, I, ver, noAds: true });
  const changed = (await writeIfChanged(resolve(PUB, "intro/index.html"), html)) ? 1 : 0;
  return { changed, urls: [{ loc: url, alts: "" }] };
}

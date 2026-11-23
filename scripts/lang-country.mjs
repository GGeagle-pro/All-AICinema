// 영상 제목 글자·단어로 언어를 짐작해 '국가' 카테고리로 바꿔 주는 규칙
//  - 관리자 > 카테고리 관리 '영상 언어로 국가 정하기' 스위치(site.json langCountry:true)일 때만 적용 → 끄면 원래대로(채널에 지정한 국가)
//  - 같은 규칙이 public/admin/admin.js 의 detectLang 에도 있음 (미리보기용) – 바꿀 때 둘 다 바꾸기
const ES = new Set("el la los las que de del y en un una por para con su sus mi es se no al lo como más pero cuando porque mujer hombre esposa esposo hija hijo amor".split(" "));
const FR = new Set("les des du est avec dans qui pas sur aux une et pour elle il femme mari fille".split(" "));
const ID = new Set("yang dan di ke dari ini itu untuk dengan tidak aku kamu dia istri suami anak".split(" "));
export const LANG_COUNTRY = { ko: "한국", ja: "일본", zh: "중국", es: "스페인", fr: "프랑스", id: "인도네시아", en: "미국" };

export function detectLang(text) {
  const s = String(text || "").replace(/https?:\/\/\S+/g, " ").replace(/#[^\s#]+/g, " ");
  const n = (re) => (s.match(re) || []).length;
  const ko = n(/[가-힣]/g), kana = n(/[぀-ヿ]/g), han = n(/[一-鿿]/g), lat = n(/[a-zA-ZÀ-ÿ]/g);
  if (ko >= 2 && ko >= kana) return "ko";
  if (kana >= 2) return "ja";
  if (han >= 4) return "zh";
  if (lat >= 8) {
    const w = s.toLowerCase().match(/[a-zà-ÿ]+/g) || [];
    const es = w.filter((x) => ES.has(x)).length, fr = w.filter((x) => FR.has(x)).length, id = w.filter((x) => ID.has(x)).length;
    if (/[ñ¿¡]/.test(s) || (es >= 2 && es > fr && es > id)) return "es";
    if (fr >= 2 && fr > es) return "fr";
    if (id >= 2) return "id";
    return "en";
  }
  return "";
}

// 채널 카테고리(국가+장르)에서 국가만 영상 언어 기준으로 바꿈. 언어를 모르면 그대로.
export function applyLangCountry(categories, title, countries) {
  const c = LANG_COUNTRY[detectLang(title)];
  if (!c || !countries.includes(c)) return categories;
  const rest = categories.filter((x) => !countries.includes(x));
  return [c, ...rest];
}

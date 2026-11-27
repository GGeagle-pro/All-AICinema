/* Google 태그 (Google Ads 전환 측정·리마케팅) – AW-947429542
 * 사이트 보안 설정(CSP)이 HTML 안의 인라인 스크립트를 막기 때문에, 구글이 주는 인라인 코드를 이 파일로 옮겼습니다.
 * 태그 스크립트는 애널리틱스 ID(G-5PXH52MY88)로 한 번만 불러오고, 아래에서 애널리틱스와 광고(AW) 둘 다 설정합니다.
 */
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
// 동의 모드 v2 (EU·EEA·영국·스위스): 방문자가 동의하기 전에는 광고·분석 쿠키를 쓰지 않음(GDPR·Google EU 사용자 동의 정책)
//  - 동의 창은 애드센스 > 개인 정보 보호 및 메시지 > 'European regulations' 메시지(구글 인증 CMP)가 띄우고, 동의하면 자동으로 granted 로 바뀜
//  - 그 밖의 나라는 기존과 같음
gtag("consent", "default", {
  ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied",
  region: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"],
  wait_for_update: 500,
});
gtag("set", "ads_data_redaction", true);
gtag("set", "url_passthrough", true);
gtag("js", new Date());
gtag("config", "AW-947429542");
// 새 Google Ads 계정 (2026-11-25, AllAICinema 773-750-3442) – 전환은 app.js 가 첫 영상 재생 때 보냄
gtag("config", "AW-18594991806");
// Google 애널리틱스 4 (방문·클릭·국가 통계 → 관리자 > 통계 탭)
gtag("config", "G-5PXH52MY88");

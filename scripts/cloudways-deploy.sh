#!/usr/bin/env bash
# Cloudways 배포 (deploy.yml · update.yml 이 같이 씀)
#  1) 이메일 + API 키로 1시간짜리 토큰 발급 (없으면 예전 CLOUDWAYS_API_TOKEN)
#  2) 서버에 Git Pull 요청
#  3) 40초 뒤 Varnish 캐시 비우기 (실패해도 배포는 성공으로 봄)
# 필요한 환경 변수: CW_EMAIL CW_KEY [CW_OLD] CW_SERVER CW_APP GIT_URL [BRANCH]
# 보안: 토큰은 로그에 가림(add-mask) 처리하고 절대 출력하지 않음
set -euo pipefail
API=https://api.cloudways.com/api/v1
BRANCH="${BRANCH:-main}"

if [ -n "${CW_EMAIL:-}" ] && [ -n "${CW_KEY:-}" ]; then
  tok=$(curl -sS --max-time 30 --proto '=https' -X POST "$API/oauth/access_token" \
    --data-urlencode "email=$CW_EMAIL" --data-urlencode "api_key=$CW_KEY" | jq -r '.access_token // empty')
  if [ -z "$tok" ]; then echo "::error::Cloudways 로그인 실패 – CLOUDWAYS_EMAIL / CLOUDWAYS_API_KEY 를 확인하세요"; exit 1; fi
else
  tok="${CW_OLD:-}"
fi
[ -n "$tok" ] && echo "::add-mask::$tok"

if [ -z "$tok" ] || [ -z "${CW_SERVER:-}" ] || [ -z "${CW_APP:-}" ]; then
  echo "::warning::Cloudways Secrets가 설정되지 않아 배포를 건너뜁니다 (README 참고)"
  exit 0
fi
case "$CW_SERVER$CW_APP" in *[!0-9]*) echo "::error::서버/앱 ID는 숫자여야 합니다"; exit 1;; esac

code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 --proto '=https' -X POST "$API/git/pull" \
  -H "Authorization: Bearer $tok" -H "Accept: application/json" \
  --data-urlencode "server_id=$CW_SERVER" --data-urlencode "app_id=$CW_APP" \
  --data-urlencode "git_url=$GIT_URL" --data-urlencode "branch_name=$BRANCH")
if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
  echo "::error::Cloudways 배포 요청 실패 (HTTP $code)"; exit 1
fi
echo "배포 요청 완료 – 수십 초 안에 사이트에 반영됩니다."

# Varnish(서버 앞단 캐시) 비우기: 안 비우면 메인 주소(/)·공유 미리보기가 예전 것으로 보임
sleep 40   # Git Pull 이 끝날 시간을 둠
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 --proto '=https' -X POST "$API/service/varnish" \
  -H "Authorization: Bearer $tok" -H "Accept: application/json" \
  --data-urlencode "server_id=$CW_SERVER" --data-urlencode "action=purge") || code=0
if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then echo "::warning::Varnish 비우기 실패 (HTTP $code) – Cloudways 화면에서 직접 Purge 하세요"; else echo "Varnish 캐시 비움"; fi

#!/usr/bin/env bash
# 데이터 파일을 커밋하고 push 합니다. 그 사이 다른 작업이 먼저 push 했으면
# 최신 상태로 맞춘 뒤 다시 생성해서 최대 3번 재시도합니다 (충돌 없이 안전하게).
#
# 사용: scripts/commit-and-push.sh "커밋 메시지" "다시 생성할 명령" 파일...
# 결과: $GITHUB_OUTPUT 에 changed=true|false 기록
set -euo pipefail

msg="$1"; regen="$2"; shift 2
files=("$@")

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

changed=false
for attempt in 1 2 3; do
  git add -- "${files[@]}"
  if git diff --cached --quiet; then
    echo "변경 없음"
    break
  fi
  git commit -q -m "$msg"
  if git push -q origin HEAD:main; then
    changed=true
    echo "저장 완료"
    break
  fi
  echo "다른 작업과 겹침 – 최신 상태로 맞춘 뒤 다시 시도 ($attempt/3)"
  git fetch -q origin main
  git reset -q --hard origin/main
  bash -c "$regen"
done

echo "changed=$changed" >> "${GITHUB_OUTPUT:-/dev/null}"

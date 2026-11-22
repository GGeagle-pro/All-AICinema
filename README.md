# All AI-Cinema – Cloudways 운영 가이드 (보안 강화판)

```
[내 PC / GitHub 웹에서 코드 수정] ──push──▶ [GitHub 저장소] ──자동 배포──▶ [Cloudways 서버 = 실제 사이트]
                                              ▲
                        [GitHub Actions: 1시간마다 새 영상 수집 → 저장 → 자동 배포]
```

- GitHub 저장소가 **원본**, Cloudways는 그 복사본을 보여주는 서버입니다.
- 코드는 항상 GitHub에서 고치세요.

## 🆕 2026-11 개편 요약
- 사이트 이름: **All AI-Cinema**
- **메뉴 2줄:** 1줄은 장르·국가(AI 드라마, AI 영화, 한국, 중국, 일본 …), 2줄은 유튜브 채널 이름(자동)
  - 1줄 메뉴는 관리자 → **메뉴·배너**에서 추가·삭제·순서 변경
  - 채널마다 여러 메뉴를 고를 수 있음(예: AI 드라마 + 한국) → 관리자 → **채널 관리**
- **채널 추가:** 관리자 → 채널 관리에서 주소 붙여넣기 → 메뉴 선택 → "추가하고 바로 반영"
  - 화면 위쪽에 저장 → 수집·배포 → 반영 완료 진행 상황이 표시돼요 (보통 1~3분)
- **자체 광고 배너 3칸:** "지금 보기" 영역과 "최신 영상" 사이. 관리자 → 메뉴·배너에서 이미지·링크 편집
  - 이미지는 브라우저에서 WebP로 다시 그려 올립니다(숨은 내용 제거). SVG는 받지 않아요
  - 사이트에는 "광고" 표시, 링크에는 `rel="sponsored"`가 붙어요
- **애드센스 광고 번호:** 관리자 → **광고 설정**에서 입력 (파일을 직접 고칠 필요 없음)
  - 자리: 상단, 하단, 왼쪽 세로(데스크톱), 오른쪽 세로(데스크톱·고정), 목록 사이, 플레이어 아래
  - 애드센스 정책상 직접 넣는 고정 광고는 데스크톱에서 하나만 허용 → 오른쪽 세로 배너만 고정
  - **상·하단 고정(앵커) 광고와 전면(비네트) 광고**는 애드센스 → 광고 → 사이트 기준 → 자동 광고 → 오버레이 형식에서 켜기
- **모바일:** 아래로 스크롤하면 헤더 숨김, 돋보기 버튼으로 검색, 메뉴·배너는 옆으로 밀어서 보기, 하단 고정 광고용 여백
- **저작권:** 재생 화면에 "YouTube에서 보기", "채널 방문" 링크. 소개 페이지에 게시 중단 요청 안내
- 설정 파일: `public/data/site.json` (메뉴·배너·애드센스), 배너 이미지: `public/uploads/`

## 폴더 구조

```
AllAI-Cinema/
├── public/              ← 웹에 공개되는 유일한 폴더 (Cloudways 웹루트)
│   ├── index.html, about.html, privacy.html, ads.txt, robots.txt
│   ├── .htaccess        ← 서버 보안 헤더·접근 차단 설정
│   ├── admin/           ← 관리자 페이지 (/admin/)
│   ├── assets/          ← app.js, style.css
│   └── data/            ← 자동 생성되는 영상 목록 (videos.json, desc.json, meta.json)
├── scripts/                   ← 영상 수집·링크 추가 스크립트 (웹에서 접근 불가)
├── channels.json              ← 채널·영상·숨김 목록 (웹에서 접근 불가)
└── .github/                   ← 자동 수집·배포 설정 (웹에서 접근 불가)
```

---

## 1단계. GitHub 저장소 만들기
1. github.com에 가입한 뒤 **New repository**를 누릅니다.
2. zip 안의 내용을 모두 올립니다. 숨김 폴더 `.github`와 숨김 파일 `public/.htaccess`도 꼭 포함하세요.
   - **GitHub Desktop** 프로그램을 쓰면 폴더째로 올릴 수 있습니다.
3. **Settings → Actions → General → Workflow permissions**에서 **Read and write permissions**를 선택합니다.
   - 실제 쓰기 권한은 영상 저장 작업에만 주도록 코드에서 제한해 두었습니다.

## 2단계. Cloudways 서버 만들기
1. cloudways.com에 가입합니다. (5일 무료 체험)
2. **Add Server**를 누르고 아래처럼 선택합니다.
   - Application: **Custom PHP**
   - 서버: **DigitalOcean**, 가장 작은 사양
   - 지역: **Singapore**

## 3단계. Cloudways ↔ GitHub 연결 (Git 배포)
1. 앱 화면 **Deployment via Git**에서 **Generate SSH Keys**를 누른 뒤 **View SSH Key**로 키를 복사합니다.
2. GitHub 저장소 **Settings → Deploy keys → Add deploy key**에 붙여넣습니다.
   - ⚠️ **"Allow write access"는 체크하지 마세요.** 서버가 해킹당해도 저장소는 바꿀 수 없게 하기 위해서입니다.
3. Cloudways에서 **Git Remote Address**에 `git@github.com:아이디/저장소.git`를 넣고 **Authenticate**를 누릅니다.
4. Branch는 **main**을 선택하고 Deployment Path는 비워둡니다. 그다음 **Start Deployment**를 누릅니다.

## 4단계. 웹루트를 public 폴더로 지정 ⭐ 중요
1. 앱 화면 **Application Settings → General → Webroot**에 `public_html/public`을 입력하고 저장합니다.
   - 이렇게 하면 `.git` 폴더(소스 전체 기록), 수집 스크립트, 설정 파일이 **웹에서 아예 보이지 않습니다.**
2. 확인해 보세요. 아래 주소가 둘 다 **404**가 나와야 정상입니다.
   - `https://내도메인/.git/config`
   - `https://내도메인/channels.json`

## 5단계. 자동 배포 켜기
1. Cloudways 왼쪽 아래 격자 아이콘에서 **API Integration → Create Access Token**을 누릅니다.
   - **Limited Access**를 선택하세요.
   - 토큰은 한 번만 보이니 바로 복사합니다.
2. GitHub 저장소 **Settings → Secrets and variables → Actions**에서 아래 3개를 추가합니다.
   - 이 값들은 **절대 코드 파일에 직접 쓰지 마세요.**

| 이름 | 값 |
|---|---|
| `CLOUDWAYS_API_TOKEN` | 1번에서 복사한 토큰 |
| `CLOUDWAYS_SERVER_ID` | 서버 화면 주소창의 숫자 |
| `CLOUDWAYS_APP_ID` | 앱 화면 주소창의 숫자 |

3. **Actions 탭 → "영상 자동 업데이트" → Run workflow**를 누릅니다. 초록 체크가 뜨면 성공입니다.

## 6단계. 도메인 · SSL · Cloudflare
1. **Domain Management**에서 도메인을 연결합니다.
2. **SSL Certificate → Let's Encrypt**로 인증서를 설치한 뒤 **Enforce HTTPS**를 켭니다.
3. Cloudflare 무료 플랜을 연결합니다. (아래 "보안 체크리스트" 참고)

---

## 🔒 보안 체크리스트 (꼭 해주세요)

### 계정 보안 – 해킹의 대부분은 계정 탈취에서 시작됩니다
- [ ] **GitHub 2단계 인증(2FA)** 켜기: Settings → Password and authentication
- [ ] **Cloudways 2단계 인증** 켜기: 계정 설정 → Two-Factor Authentication
- [ ] **애드센스(Google 계정) 2단계 인증** 켜기 → 수익금 탈취 방지
- [ ] 세 계정의 비밀번호를 **서로 다르게**, 다른 사이트와도 다르게 설정
- [ ] GitHub **Settings → Branches → Add rule (main)**에서 "Allow force pushes"와 "Allow deletions" **끄기**
  - 기록을 지우거나 덮어쓰는 공격을 막습니다.

### Cloudways 서버
- [ ] **Deploy key는 읽기 전용**인지 확인 (3단계)
- [ ] **웹루트 = public_html/public**인지 확인 (4단계)
- [ ] SFTP/SSH를 안 쓸 때는 **Server → Security → SSH/SFTP**에서 내 IP만 허용 (IP Whitelisting)
- [ ] API 토큰은 **Limited Access**로 만들고, 유출이 의심되면 즉시 삭제 후 재발급

### Cloudflare 무료 플랜 (DDoS·봇 공격 방어)
1. cloudflare.com에 무료로 가입한 뒤 **Add a site**에 도메인을 입력하고 **Free**를 선택합니다.
2. 안내받은 네임서버로 도메인 구입처 설정을 바꿉니다.
3. DNS에서 A 레코드(`@` → Cloudways 서버 IP)의 **주황 구름(Proxied)**을 켭니다. 그러면 서버 실제 IP가 숨겨집니다.
4. **SSL/TLS** 메뉴에서 설정합니다.
   - 모드: **Full (strict)**
   - Edge Certificates: **Always Use HTTPS** 켜기, **Minimum TLS 1.2**
   - **HSTS** 켜기 (max-age 6개월 이상)
5. **Security → Bots → Bot Fight Mode** 켜기
6. **Security → WAF**: 무료 관리형 규칙이 기본으로 켜져 있는지 확인합니다.
7. (선택) **Caching → Cache Rules**: URI Path starts with `/data/` → Eligible for cache, Edge TTL 5분
   - 서버 부하와 전송량이 크게 줄어듭니다.

### 코드에 적용된 보안 장치

| 위협 | 대응 |
|---|---|
| **XSS** (영상 제목·설명에 악성 코드를 넣어 방문자 브라우저에서 실행) | 수집할 때 제어문자 제거·길이 제한 → 화면에 넣을 때 다시 이스케이프(이중 방어). 인라인 스크립트와 `onclick=` 같은 속성 스크립트는 CSP로 실행 자체를 차단 |
| **주소 조작** (`?v=` 값에 악성 문자열) | 유튜브 영상 ID 형식(11자)만 허용 |
| **클릭재킹** (내 사이트를 투명 iframe으로 덮어 클릭 유도) | `frame-ancestors`, `X-Frame-Options` 헤더 + 스크립트 방어 |
| **소스·설정 파일 노출** (`.git`, 스크립트) | 웹루트를 `public/`으로 분리, 숨김 파일·백업 파일 접근 차단 |
| **외부 라이브러리 변조** (폰트 CDN 해킹) | SRI 무결성 검사: 파일 내용이 바뀌면 브라우저가 거부 |
| **서버 공격** (POST 요청, 디렉터리 목록 보기) | GET/HEAD 외 요청 거부, 디렉터리 목록 끔, 서버 정보 숨김 |
| **수집 스크립트 악용** (설정 파일 조작으로 다른 사이트 접속, 거대 응답으로 멈춤) | youtube.com 외 접속 불가, 요청당 15초·5MB 제한, 채널 ID·핸들 형식 검사 |
| **깨진 데이터 공개** | 임시 파일에 쓴 뒤 교체해서 반쯤 쓰인 파일이 공개되지 않음 |
| **GitHub Actions 권한 남용** | 기본 읽기 전용, 저장 작업만 쓰기 권한. 토큰은 Secrets에만 두고 로그에 출력 안 함. 작업 시간 제한 |
| **오래된 구성요소의 취약점** | Dependabot이 Actions 보안 업데이트를 매주 자동 제안 |
| **광고 ID를 넣기 전 잘못된 광고 요청** | 올바른 게시자 ID 형식일 때만 광고 코드 실행 |

> **CSP(콘텐츠 보안 정책) 참고:** Google은 애드센스용 CSP로 요청마다 바뀌는 nonce 방식만 공식 지원합니다. 정적 사이트에서는 쓸 수 없는 방식입니다.
>
> 그래서 이 사이트는 다음처럼 설정했습니다.
> - **차단:** 인라인 스크립트, 속성 스크립트, 플러그인
> - **허용:** 외부 https 스크립트 (애드센스·유튜브가 쓰는 도메인이 수시로 바뀌기 때문)
>
> 광고가 안 나오면 브라우저 개발자도구(F12) → Console에서 "Content Security Policy" 오류를 확인하세요.

---

## 📺 채널·영상 추가하기

유튜브를 보다가 좋은 AI 영화·드라마·단편을 발견하면 링크만 넘기면 됩니다.

| 무엇을 | 결과 |
|---|---|
| **채널 링크** (`youtube.com/@핸들`) | 최근 영상이 바로 추가되고, **앞으로 올라오는 새 영상도 1시간마다 자동 추가** |
| **영상 링크** (`youtu.be/…`, `/shorts/…`) | 그 영상 하나만 추가 (채널 전체를 넣고 싶지 않을 때) |
| **숨기기** | 영상 링크 → 그 영상만 사이트에서 숨김 / 채널 링크 → 채널과 그 영상 전체 삭제 |

### 방법 A. GitHub 이슈로 추가 (휴대폰에서 추천) ⭐
1. 유튜브 앱에서 **공유 → 링크 복사**를 누릅니다.
2. GitHub 앱(또는 github.com)에서 내 저장소 → **Issues → New issue → "채널·영상 추가"**를 누릅니다.
3. 링크를 붙여넣고, 카테고리를 고르고 **Submit**을 누릅니다.
   - 링크는 여러 개를 한 번에 넣어도 됩니다. 한 줄에 하나씩 넣으세요.
4. 1~2분 뒤 이슈에 결과 답글이 달리고 자동으로 닫힙니다. 사이트에도 반영됩니다.
   - 예: ✅ 채널 추가 / ✅ 영상 추가 / ❌ 재생 금지 영상
5. **빠른 접속:** 아래 주소를 휴대폰 홈 화면에 추가해 두면 편합니다.
   `https://github.com/아이디/저장소/issues/new?template=add.yml`

> **보안:** 저장소 **주인이 연 이슈만** 처리됩니다. 다른 사람이 이슈를 열어도 아무 일도 일어나지 않습니다.
> 저장소가 조직(Organization) 소유라면 `.github/workflows/add.yml`의 `'OWNER'`를 `'MEMBER'`로 바꾸세요.

### 방법 B. PC 브라우저 북마크 버튼 (원클릭)
1. 브라우저 북마크바에서 **새 북마크**를 만듭니다.
2. 이름은 "All AI-Cinema에 추가", URL에는 아래 한 줄을 붙여넣습니다. `아이디/저장소`는 본인 것으로 바꾸세요.
```
javascript:void(window.open('https://github.com/아이디/저장소/issues/new?template=add.yml&title='+encodeURIComponent('[추가] '+document.title)+'&links='+encodeURIComponent(location.href)))
```
3. 유튜브 영상이나 채널 페이지에서 이 북마크를 누릅니다. 링크가 채워진 이슈 양식이 열리면 카테고리만 고르고 **Submit**을 누르세요.

### 방법 C. `channels.json` 직접 수정
GitHub 웹에서 `channels.json`을 열고 ✏️ 아이콘으로 수정한 뒤 **Commit**하면 바로 수집이 실행됩니다.
```json
{
  "channels": [
    { "url": "https://www.youtube.com/@채널핸들", "name": "표시 이름", "category": "AI 영화" }
  ],
  "videos": [
    { "url": "https://youtu.be/영상ID", "category": "AI 단편" }
  ],
  "exclude": [
    "https://youtu.be/숨길영상ID"
  ]
}
```
- 항목 사이 쉼표(,)를 빠뜨리면 오류가 납니다. 휴대폰에서는 방법 A를 쓰는 게 편합니다.
- **카테고리 이름은 자유입니다.** 새 이름을 쓰면 사이트 상단에 새 탭이 생깁니다.
  - 이슈 양식의 카테고리 목록은 `.github/ISSUE_TEMPLATE/add.yml`에서 바꿉니다.
- **추가가 안 되는 영상:** 비공개 영상, 삭제된 영상, 유튜브에서 "다른 사이트 재생"을 막아둔 영상은 사이트에서 재생할 수 없어 추가되지 않습니다.

---

## 🛠️ 관리자 페이지 (영상 개별 숨기기)

`https://내도메인/admin/` 에서 채널별로 영상을 골라 숨기거나, 채널을 추가·삭제할 수 있습니다.
숨긴 영상은 채널에 계속 남아 있어도 **다시는 사이트에 나타나지 않습니다.**

### 할 수 있는 일
| 탭 | 기능 |
|---|---|
| 영상 관리 | 채널 선택 → 영상 하나씩 **숨기기**, 또는 여러 개 체크 후 한 번에 숨기기, 제목 검색 |
| 숨긴 영상 | 숨긴 영상 목록, **복원** |
| 채널 관리 | 채널·영상 링크 추가, 등록된 채널 삭제 |

저장하면 1~2분 뒤 사이트에 반영됩니다. (GitHub의 `channels.json`이 바뀌고 → 자동 수집 → 자동 배포)

### 로그인용 토큰 만들기 (처음 한 번, 약 5분)
관리자 페이지는 비밀번호 대신 **GitHub 토큰**으로 로그인합니다. 서버에 비밀번호를 저장하지 않아서 더 안전합니다.

1. GitHub 오른쪽 위 프로필 사진 → **Settings** → 왼쪽 맨 아래 **Developer settings**
2. **Personal access tokens → Fine-grained tokens → Generate new token**
3. 아래처럼 입력합니다.
   - Token name: `All AI-Cinema 관리자`
   - Expiration: **90 days** (만료되면 같은 방법으로 새로 만들면 됩니다)
   - Repository access: **Only select repositories** → `AllAI-Cinema` 선택
   - Permissions → Repository permissions → **Contents: Read and write** (나머지는 건드리지 않음)
4. **Generate token**을 누르고 `github_pat_`으로 시작하는 토큰을 복사합니다. (한 번만 보입니다)
5. `https://내도메인/admin/`을 열고 아래처럼 넣은 뒤 **로그인**을 누릅니다.
   - 저장소: `아이디/AllAI-Cinema`
   - GitHub 토큰: 방금 복사한 토큰

### 보안 수칙
- 토큰은 **이 저장소의 파일 읽기/쓰기만** 할 수 있게 만들었습니다. 다른 저장소나 계정 설정은 건드릴 수 없습니다.
- 토큰은 관리자 브라우저에만 저장되고 GitHub(api.github.com)에만 전송됩니다. 사이트 서버에는 저장되지 않습니다.
- **"로그인 유지"는 개인 기기에서만** 켜세요. 끄면 브라우저 탭을 닫을 때 자동 로그아웃됩니다.
- 토큰이 유출된 것 같으면 2번 화면에서 그 토큰을 **Delete**하세요. 즉시 무효가 됩니다.
- 관리자 페이지 주소를 알아도 토큰이 없으면 아무것도 바꿀 수 없습니다. 검색엔진에도 노출되지 않게 막아 두었습니다.

### 알아두기
- **복원:** 복원한 영상은 다음 수집 때 다시 보입니다. 단, 그 채널의 **최근 영상 15개 안에 있을 때만** 다시 수집됩니다. 오래된 영상을 다시 보이게 하려면 채널 관리 탭에서 영상 링크로 추가하세요.
- **채널 삭제:** 채널을 삭제하면 그 채널의 영상도 모두 사이트에서 빠집니다.
- **휴대폰 이슈 방식과 같이 써도 됩니다:** "📺 채널·영상 추가하기"의 방법과 함께 써도 서로 충돌하지 않습니다.

---

## 코드를 수정하는 방법

| 방법 | 언제 | 하는 법 |
|---|---|---|
| **GitHub 웹에서 바로** | 간단한 수정 | 파일 열기 → ✏️ 연필 아이콘 → 수정 → **Commit changes** |
| **VS Code + GitHub Desktop** | 큰 수정 | Clone → 수정 → 미리보기 → **Commit → Push** |

- main에 올라가면 **1분 안에 자동 반영**됩니다. 진행 상황은 Actions 탭에서 볼 수 있습니다.
- **PC에서 미리보기:** `public` 폴더에서 `python3 -m http.server`를 실행한 뒤 http://localhost:8000 으로 접속합니다.
- **보안 규칙 (지켜주세요):**
  - HTML에 `onclick="…"`이나 `<script>…</script>` 같은 **인라인 코드를 넣지 마세요.** CSP가 막습니다. 스크립트는 `assets/app.js`에 작성합니다.
  - 외부에서 받은 글자(제목·설명 등)를 화면에 넣을 때는 반드시 `esc()`를 거치거나 `textContent`를 쓰세요.

## 자주 고치는 파일

| 파일 | 내용 |
|---|---|
| `channels.json` | 채널·영상·숨김 목록. 수정하면 즉시 다시 수집합니다. |
| `.github/ISSUE_TEMPLATE/add.yml` | 추가 양식의 카테고리 목록 |
| `public/index.html` | 사이트 제목, 상단/하단 광고 코드 |
| `public/assets/style.css` | 색상·레이아웃 |
| `public/assets/app.js` | 맨 위 설정: 애드센스 ID와 슬롯, 광고 간격, 새 영상 확인 주기 |
| `public/about.html`, `public/privacy.html` | 소개·개인정보처리방침 (연락처 이메일 교체) |
| `public/ads.txt` | 애드센스 게시자 ID (`pub-…`) |

채널·영상 추가 방법은 위의 **"📺 채널·영상 추가하기"**를 보세요.

### 애드센스
아래 파일에서 `ca-pub-8096684162493748`를 본인 게시자 ID(숫자 16자리)로 바꿉니다.
- `public/index.html`, `public/about.html`, `public/privacy.html`, `public/assets/app.js`
- `public/ads.txt`에는 `pub-…` 형식으로 넣습니다.

슬롯 번호도 실제 번호로 교체합니다.
- `index.html`: 1111111111(상단), 2222222222(하단)
- `app.js`: 3333333333(목록 사이), 4444444444(플레이어 아래)

게시자 ID를 넣기 전에는 광고 자리가 자동으로 숨겨집니다.

---

## 서버 비용
- **영상과 썸네일:** 유튜브 서버에서 방문자에게 바로 전송됩니다. 내 서버 비용과 무관합니다.
- **내 서버가 보내는 것:** HTML·CSS·JS·영상 목록뿐입니다. 첫 방문 약 100KB이고, 다시 방문하면 대부분 304(변경 없음)입니다.
- **요금제 여유:** Cloudways 최저 요금제($11)에 월 2TB 전송량이 포함됩니다.
- **적용된 절약 장치:** 목록 압축, 설명 지연 로딩, 100바이트 meta.json으로 새 영상 확인, 새 영상 없으면 6시간마다만 저장, 작은 썸네일
- **GitHub Actions:** Public 저장소는 무료로 무제한, Private 저장소는 월 2,000분까지입니다. Private이면 `update.yml`의 cron을 `"0 * * * *"`로 바꾸세요.

## 문제가 생기면
- **배포 후 사이트가 "500 Internal Server Error":** `public/.htaccess`의 `<LimitExcept GET HEAD>` 3줄을 지우고 다시 올려보세요. 서버 설정에 따라 이 기능이 허용되지 않을 수 있습니다.
- **Actions에 빨간 X가 떴을 때:** 해당 항목을 눌러 로그를 확인합니다.
  - "HTTP 401"이면 토큰을 재발급해서 Secrets를 갱신합니다.
- **반영이 안 될 때:** Cloudways **Deployment via Git** 화면에서 **Pull**을 눌러 수동 배포합니다.
- **새 영상이 안 들어올 때:** Actions 로그에서 채널별 ✓/✗ 표시를 확인합니다.
- **광고가 안 나올 때:** 승인 전이면 정상입니다. 승인 후에도 안 나오면 F12 → Console에서 CSP 오류를 확인합니다.

교사 화면 필터(2026-10-04): 학생 이메일 클릭 → 학생별 기록, 시간/사이트/검색어 필터 조합, 최신순·오래된순 정렬, 필터 초기화. 최근 24시간 중 최신 600건을 대상으로 하며 자동 새로고침에도 선택이 유지됩니다. 화면 필터는 수집 범위를 변경하지 않습니다.

2026-10-04 최종 학생 버전 0.2.2: 기기 ID·학생 이메일 사전 등록 없이 정책 설치된 프로필에서 ON/OFF 수집합니다. 교사 로그인·수집 표시·학교 이메일 형식·설정 오류 및 OFF 시 중지를 유지합니다. 현재 사용법: docs/STUDENT-SELFHOST.md. 아래 이전 버전 설명은 별도 진단/로컬 시험 또는 과거 학생 시험입니다.

2026-10-04 학생 버전 0.2.1: 교사 화면 ON/OFF로 계속 수집하도록 변경했습니다. 학생 이메일 사전 등록은 필요 없습니다. 학교 기기 allowlist와 교사 로그인은 유지하며, diagnostic 모드에서는 기록을 수집하지 않습니다. 아래 원래 0.1.0 진단·교사 로컬 10분 시험 설명은 별도 버전입니다. 현재 학생 배포 절차는 docs/STUDENT-SELFHOST.md를 따릅니다.

학교 Chromebook 자체 호스팅 첫 설치 시험: [관리자에게 입력할 실제 ID·URL과 절차](docs/STUDENT-SELFHOST.md). 처음에는 diagnostic 모드로 설치·계정·기기만 확인합니다.

# 학교 크롬북 배포 진단 시험 — 1단계

## 현재: GitHub → Vercel 학생 이메일 시험 0.2.0

교사가 학생 OAuth를 생략하도록 변경 요청했습니다. Vercel 배포 진입점은 **`index:app`**, 배포 방법은 [짧은 Vercel 안내](docs/VERCEL-QUICKSTART.md)입니다. 서버는 외부 PostgreSQL과 교사 로그인 해시를 요구합니다. 학생 이메일은 인증되지 않은 값이며 화면에도 그렇게 표시합니다. 허용 시험 계정 2~3명과 실제 기기 목록을 지정한 뒤 교사가 시작한 10분/200건 수집만 받습니다.

`npm run build:student`는 **`student-test-dist`와 `student-email-test-0.2.0.zip`**을 생성합니다. 기본 주소는 예약 예시값이므로 발급받은 Vercel HTTPS 주소로 다시 빌드해야 합니다. GitHub/Vercel 서버 배포와 학생 확장 정책 배포는 별개이며, 실제 학교 정책 설치·기기 API·Vercel PostgreSQL 연결은 미검증입니다. `.env.example`은 Vercel 환경변수 템플릿이고 실제 값은 저장소에 넣지 않습니다.

이하 기존 0.1.0 진단과 본인 PC 시험은 그대로 보존합니다. 기존 진단 버전의 OAuth 요구사항은 새로운 이메일 시험 버전에 적용하지 않습니다.

실제 학생 Chromebook 첫 시험 준비는 [짧은 안내](docs/STUDENT-FIRST-TEST.md)를 확인하세요. 학교용 HTTPS·PostgreSQL 배치 구성을 `deploy/school-server`에 추가했습니다. 인증된 이메일 표시를 사용하며, 실제 서버 주소·OAuth·게시 ID는 아직 미확정입니다. 이 배치 구성은 수집 없는 학생 진단 서버입니다.

TypeScript / Manifest V3 확장, Python / FastAPI 서버, 인증된 교사용 웹 화면을 구현했습니다. **1단계 `dist` 배포 진단 확장에는 검색·방문기록을 읽는 코드와 권한이 없습니다.** 자동 창·권한 승인·로그인 화면을 띄우지 않습니다. 확장 아이콘을 클릭하면 한국어 진단 화면을 볼 수 있습니다.

2026-10-02 교사가 추가로 요청한 **본인 PC 수집 → 시험 서버 전송**은 별도 `local-test-dist` 확장과 `server/local_test_app.py`에 구현했습니다. 교사가 직접 인증·시작한 10분/200건 시험이며 실제 학생 배포용이 아닙니다. 지금 시험하는 방법은 `docs/LOCAL-COLLECTION-TEST.md`입니다. `start-local-collection.cmd`로 서버를 실행하고 Chrome에 `local-test-dist`를 로드합니다. 기존 배포 진단과 게시용 ZIP의 범위는 그대로 유지했습니다.

이 프로그램은 수업 기록 시스템 개발 전 배포·인증·기기 API 가능성을 확인하는 시험입니다. 수업 시간표, 방문·검색 기록, 정기 보고서는 이번 단계의 구현 범위가 아닙니다. 진단은 시험이 켜진 동안 실행되며 교사는 최신 상태만 조회합니다.

새로 확인한 관리자 ID 추가 화면에 맞춘 **웹 스토어/자체 호스팅 비교와 입력 순서**는 `docs/DISTRIBUTION.md`, 스토어 제출 초안은 `docs/STORE-SUBMISSION.md`에 있습니다. 현재 실제 확장 ID·배포 URL은 미확정입니다. `scripts/selfhost.mjs`는 담당자의 실제 키·주소가 있을 때 서명 CRX3·업데이트 XML·입력 파일을 생성하며, 예시 주소나 단순 ZIP을 배포 URL로 사용하지 않습니다. 기본 확장 ZIP은 계속 안전 대기용입니다.

## 바로 실행

프로젝트 루트에서 실행합니다. Node.js 24+, Python 3.12+가 필요합니다.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run zip
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements.lock.txt
Copy-Item server/.env.example server/.env
Set-Location server
$env:DISABLE_SQLALCHEMY_CEXT_RUNTIME='1' # 이 Windows 작업 환경의 선택적 C 확장 제한 대응
..\.venv\Scripts\python.exe scripts/password.py
# 출력된 해시를 .env의 TEACHER_PASSWORD_HASH에 입력
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000 --no-access-log
```

교사용 화면은 `http://127.0.0.1:8000/`입니다. 서버 전용 교사 계정과 비밀번호로 브라우저의 HTTP Basic 인증을 통과해야 열립니다. 첫 실행에 데이터가 없는 것은 정상입니다. OAuth 설정 없이 학생 인증은 성공하지 않습니다. `/health`에는 학생 정보가 없습니다.

이 작업 환경의 기본 `python`은 Windows 실행 별칭으로 동작하지 않아 제공된 Python 런타임으로 `.venv`를 생성했습니다. 현재 폴더에서는 `.venv/Scripts/python.exe`로 실행할 수 있습니다. Windows 애플리케이션 제어 정책이 SQLAlchemy 선택적 C 확장을 막는 경우, 테스트/서버 실행 전 `$env:DISABLE_SQLALCHEMY_CEXT_RUNTIME='1'`을 지정합니다. Python 구현으로 동일한 DB 처리를 수행합니다.

기본 빌드는 `https://pilot.example.invalid` 한 원점만 허용하고 OAuth 항목을 넣지 않습니다. 게시용 형식의 ZIP까지 생성되지만 이 기본 ZIP은 실제 서버 연결용이 아닙니다. 실제 학교 서버 원점과 확정된 Chrome Extension OAuth client ID를 넣은 빌드가 필요합니다.

```powershell
$env:PILOT_SERVER_ORIGIN='https://학교의-실제-시험-서버'
$env:GOOGLE_CLIENT_ID='확정된-Chrome-Extension-client-ID.apps.googleusercontent.com'
# 개발용 ID를 게시 ID와 맞추려면 대시보드에서 얻은 공개 키 사용
$env:EXTENSION_PUBLIC_KEY='공개키-한줄-base64'
npm.cmd run build
npm.cmd run zip
```

서버 원점은 경로·마지막 슬래시 없이 HTTPS 원점만 넣습니다. 예시 문자열은 실제 값으로 교체합니다. managed 서버 주소가 빌드의 허용 원점과 일치하지 않으면 대기합니다. 원점 변경은 확장 재빌드와 정책 변경이 함께 필요합니다.

## 구성

| 경로 | 내용 |
|---|---|
| `extension/src/worker.ts` | 설치·시작·worker 재시작·알람·정책·계정 변화 진단 |
| `extension/src/core.ts` | 관리 설정 검증, 기기 판정, 알람, backoff, 제한된 전송 DTO |
| `extension/managed-schema.json` | 중앙 설정 스키마 |
| `dist/` | 빌드된 확장, 개발자 PC 검사용 |
| `scripts/build.mjs`, `scripts/zip.mjs` | 빌드와 게시용 ZIP |
| `server/app.py` | Google 토큰 검증, 상태 저장, 교사 인증 |
| `server/dashboard.*` | 교사용 한국어 상태 화면 |
| `policy/` | 관리자 콘솔 입력용 JSON과 원시 managed 값 예시 |
| `docs/DEPLOYMENT.md` | 권한·OAuth·정책 배포·중지·기기 검증 절차 |
| `docs/TEST-RESULTS.md` | 로컬 결과와 미검증 항목 |
| `docs/DISTRIBUTION.md`, `docs/STORE-SUBMISSION.md` | 확인된 관리자 화면의 입력 순서, 두 배포 경로, 제출 초안 |
| `scripts/keygen.mjs`, `scripts/key-info.mjs`, `scripts/selfhost.mjs`, `scripts/verify-crx.mjs` | 자체 호스팅 키·ID·CRX3·XML 생성과 검사 |
| `deploy/selfhost/nginx.conf.example` | 정적 HTTPS 호스팅 구성 예시. 실제 주소·인증서 교체 필요 |
| `local-test/`, `local-test-dist/` | 교사 본인 PC 수집 시험 소스/빌드. 1단계 정책 배포용과 별개 |
| `start-local-collection.cmd`, `server/local_test_run.py` | 교사 시험 암호를 직접 정하고 본인 PC loopback 서버 실행 |
| `docs/LOCAL-COLLECTION-TEST.md` | 실제 수집·서버 저장 확인·중지·삭제 절차 |

## 인증·데이터 범위

`chrome.identity.getProfileUserInfo({accountStatus: ANY})`는 동기화 비활성 프로필도 확인합니다. 이메일과 실제 Google 계정 ID가 없으면 학교 계정 확인 완료로 표시하지 않습니다. 이메일을 읽는 것과 인증은 다릅니다.

확장은 계정을 지정한 `getAuthToken({interactive:false})`만 사용합니다. 먼저 본문 없는 인증 probe를 호출하고, 서버가 확인한 이메일이 프로필과 일치해야 상태를 POST합니다. 서버는 모든 POST에서 다시 Google HTTPS tokeninfo와 userinfo를 확인합니다. audience, 만료, 이메일 scope, subject 일치, 이메일 검증 여부, `@goedu.kr` 및 서버의 시험 계정 allowlist를 모두 검사합니다. 본문 이메일·학생 ID는 받지 않습니다. 인증용 bearer token 자체는 인증에 필요한 정보이며 저장하지 않습니다.

전송 항목은 학교 식별값, Directory 기기 ID 또는 null, 기기 확인 상태, 정책 설치 유형, 플랫폼, 확장 버전, 실행 원인, 관리 간격, 이전 요청 실패 유무뿐입니다. 원본 오류 메시지는 로컬에만 있습니다. 서버가 저장하는 이메일은 Google에서 검증된 값입니다. 요청 DTO 밖의 URL·검색어·페이지 내용·이메일 등 추가 필드는 422로 거부합니다.

기기 API 값과 allowlist 일치는 클라이언트가 주장한 기기 식별 확인이며 암호학적 기기 증명이 아닙니다. 이 설계는 악의적으로 변조된 클라이언트에 대한 기기 인증을 제공하지 않습니다. 이를 후속 기록 수집의 충분한 보안 근거로 사용하면 안 됩니다.

서버 기본 DB는 SQLite입니다. 운영 기준은 SQLAlchemy를 통한 PostgreSQL이며 `DATABASE_URL=postgresql+psycopg://…`로 선택합니다. `compose.yaml`은 로컬 PostgreSQL 개발 구성을 제공합니다. PostgreSQL 실연결은 이 환경에서 미검증입니다. 학교·계정·기기별 최신 상태 1건을 갱신하고 기본 14일이 지난 행은 시작/수신 시 삭제하며 조회에서 제외합니다. 장기 이력·정기 보고서를 만들지 않습니다.

`docs/DEPLOYMENT.md`의 실제 기기 검증을 통과하기 전, 추가 로그인 없는 운영이 가능하다고 결론 내릴 수 없습니다.

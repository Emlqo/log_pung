관리자 콘솔에 붙여넣는 정책은 `policy/student-selfhost-admin-console.json`처럼 각 값을 `{"Value": ...}`로 감싸야 합니다. 기존 평탄한 managed 예시는 storage.managed에서 읽는 값의 형태이며 콘솔 업로드 형식과 다릅니다. 자세한 설치 절차는 STUDENT-SELFHOST.md를 확인하세요.

# GitHub → Vercel 시험 서버

학생 OAuth를 생략한다는 교사의 변경 요청을 반영한 버전입니다. 학생 이메일은 **인증되지 않은 클라이언트 주장**입니다. 누구나 허용 계정 이메일을 사칭할 수 있으며 기기 ID도 원격 인증된 값이 아닙니다. 교사 조회 로그인은 유지합니다. 기존 OAuth 진단 버전과 교사 본인 로컬 수집 시험은 그대로 보존했습니다.

## 선생님이 하는 순서

1. Vercel 로그인 → **Add New → Project** → GitHub의 **Emlqo/log_pung** Import. 비공개 저장소도 연결 가능하며, GitHub 앱의 저장소 접근 허용이 필요할 수 있습니다. Root Directory는 프로젝트 루트입니다. Python 3.12 서버입니다. `vercel.json`이 `index.py`를 `@vercel/python` 함수로 빌드하고 모든 경로를 그 함수로 연결합니다. 확장 프로그램의 npm 빌드 결과를 정적 사이트로 배포하지 않습니다. Docker·Caddy는 이 배포에 사용하지 않습니다.
2. 프로젝트 Storage/Marketplace에서 PostgreSQL을 연결합니다. 공급자의 비용·계약 동의는 선생님이 확인하고 진행합니다. 제공되는 **pooled connection URL**을 `DATABASE_URL` 환경변수로 지정합니다. `postgres://`, `postgresql://` 주소는 psycopg 형식으로 자동 변환합니다. 외부 DB에는 공급자 권장 TLS(`sslmode=require` 등)를 유지하세요. SQLite 파일·메모리 세션은 Vercel 저장소로 사용하지 않습니다.
3. Vercel 환경변수에 다음을 입력합니다. 실제 값은 GitHub에 커밋하지 않습니다.

| 변수 | 값 |
|---|---|
| `DATABASE_URL` | 외부 PostgreSQL 실제 접속 URL |
| `SCHOOL_ID` | `school-pilot` 등 동일한 학교 시험 식별값 |
| `TEST_ACCOUNT_EMAILS` | 시험 `@goedu.kr` 계정 **2~3개**, 쉼표 구분 |
| `TEACHER_PASSWORD_HASH` | `server/scripts/password.py`를 실행해 생성한 해시 |
| `ALLOWED_DEVICE_IDS` | 실제 Directory 기기 ID, 초기 진단은 비워둘 수 있음 |
| `STUDENT_TEST_ENABLED` | 설정 확인 후 `true` |

4. Deploy 또는 Redeploy. 발급된 실제 주소의 `/health`가 `unverified-email-pilot`을 반환하는지 확인합니다. `/`와 `/api/teacher/view`는 로그인 없이 **401**이어야 합니다. 교사 로그인은 `teacher`와 해시를 생성할 때 입력한 비밀번호입니다. 설정 미완료면 503으로 안전하게 대기합니다.
5. Vercel의 프로젝트 자체 Deployment Protection이 활성화되어 있으면 학생 확장의 익명 POST도 차단될 수 있습니다. 운영 Production URL에서 API 접근 가능 여부를 확인해야 합니다. 학생 확장에 Vercel 로그인·공용 bypass key를 넣지 않습니다. 보호 정책 변경이 필요하면 선생님이 공개 수신 endpoint와 로그인 필수 교사 화면의 구분을 검토해 설정합니다.
6. 발급된 HTTPS 원점으로 학생 시험 확장을 다시 빌드합니다.

```powershell
$env:PILOT_SERVER_ORIGIN='실제_HTTPS_원점으로_교체'
npm.cmd run build:student
```

`student-email-test-0.2.0.zip`이 게시용 파일입니다. 기본 빌드의 `pilot.example.invalid`은 **동작 주소가 아닌 안전 대기 예시값**입니다. Google Cloud OAuth client ID는 이 버전에 사용하지 않습니다.

## 학생 Chromebook 첫 시험

Vercel/GitHub에 올리는 것은 **서버 배포**이며 확장 강제 설치와는 별개입니다. 학생을 수동 설치시키지 않습니다.

1. 학생 ZIP을 Chrome Web Store에서 학교 정책에 허용되는 공개/조직 게시 방식으로 제출합니다. 실제 게시·심사 후 받은 ID를 관리자 콘솔 **ID로 추가 → Chrome 웹 스토어 → 저장 → 설치 정책 ‘강제 설치’ → 저장**에 넣습니다. 시험 학생 2~3명 그룹만 선택합니다. 이전 0.1.0 진단 ID와 새로운 확장 ID를 혼동하지 않습니다.
2. 새 확장 정책의 managed 설정에 `policy/student-managed.example.json`의 실제 HTTPS 원점과 학교 식별값을 넣고 `testEnabled=true`, `devicePolicy=diagnostic`으로 시작합니다. **진단에서는 검색을 수집하지 않고 이메일·기기 상태만 보냅니다.** 이메일은 인증되지 않습니다.
3. 실제 ChromeOS `Directory 기기 ID`, 정책 설치 `admin`을 확인합니다. 기기 목록이 비어 있거나 ID를 읽지 못하면 교육청 등록 조직/조회 권한/affiliation을 확인합니다. 가짜 ID로 통과시키지 않습니다.
4. 서버 `ALLOWED_DEVICE_IDS`와 managed `allowedDeviceIds`에 실제 승인 기기 ID를 넣고, managed `devicePolicy=allowlist`로 변경합니다. 환경변수 변경 후 Vercel Redeploy가 필요합니다.
5. 교사 화면 **‘10분 수집 시험 시작’**. 학생 확장은 최대 5분 뒤 주기 확인하며, 아이콘의 상태 확인 버튼으로 즉시 상태를 확인할 수도 있습니다. 추가 Google 로그인·자동 팝업은 없습니다. 새 방문 URL과 지원 검색어만 수집합니다. 10분/계정별 200건으로 종료됩니다.
6. 교사 화면에서 이메일·기록을 확인한 뒤 **시험 중지**. 중지 후 새 기록은 서버가 거부하고 확장도 다음 방문 전 서버 상태를 검사해 수집을 중단합니다. 전체 학교로 확대하지 않습니다.

최근 1일 데이터만 조회하고 서버 시작/새 수신에서 만료 기록을 정리합니다. 전역 자동 정리 스케줄은 이 시험에 추가하지 않았습니다. 신뢰할 수 있는 학생 신원 인증이 필요한 운영 단계에는 별도 인증을 다시 적용해야 합니다.

학생 게시용 ZIP에는 수집 권한이 있으므로 이전 진단 전용 자체 호스팅 스크립트가 의도적으로 거부합니다. 학생 CRX는 별도 selfhost:student 도구로 준비했으며 절차는 STUDENT-SELFHOST.md를 따릅니다. 서버 사이트 주소나 ZIP을 관리자 콘솔의 맞춤 업데이트 URL로 입력하지 않습니다.

[Vercel FastAPI 배포](https://vercel.com/docs/frameworks/backend/fastapi), [Vercel GitHub 연결](https://vercel.com/docs/git/vercel-for-github)

## Python 파일이 다운로드될 때

GitHub 최신 커밋이 배포되었는지 Vercel **Deployments**에서 확인하고, **최신 배포의 Visit**을 여세요. 이전 배포의 고유 URL은 계속 이전 버전입니다. 자동 배포가 없으면 최신 main으로 새 배포를 만듭니다. Root Directory는 저장소 루트(`./`)이며 Output Directory 임의 설정은 해제합니다.

이 프로젝트는 자동 감지에만 의존하지 않도록 지원되는 명시적 Python builder와 전체 경로 라우팅을 사용합니다. `builds`는 레거시 설정이지만 이번 오류 복구에 사용했으며 향후 기본 FastAPI 배포로 전환할 수 있습니다. 정적 파일은 별도 게시하지 않고 교사 HTML/JS도 인증 후 서버가 제공합니다. `/health`는 JSON, `/`는 교사 로그인, `/index.py`는 404가 정상입니다. DB 초기화는 ASGI 시작 이벤트가 없는 환경에서도 첫 데이터 요청에 실행됩니다. PostgreSQL 초기화·동시 시작은 실제 외부 DB에서 추가 검증해야 합니다.

[Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python), [명시적 builds와 routes](https://vercel.com/docs/project-configuration/vercel-json)

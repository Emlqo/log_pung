# 학교 시험 배포·검증 설명서

2026-10-01 Chrome/Google 공식 문서를 확인했습니다. 메뉴 이름과 권한은 조직 관리 범위에 따라 달라질 수 있습니다. 실제 교육청 관리자 설정, 게시 권한, 심사, 학교 Chromebook 테스트는 수행하지 않았습니다.

## 권한과 API 선택

| 권한/API | 목적과 한계 |
|---|---|
| `identity` | 프로필 정보 및 비대화형 OAuth. 승인/로그인이 필요하면 실패하고 로컬 원인을 표시 |
| `identity.email` | 기본 Chrome 프로필 이메일·ID 진단. 인증 증명으로 사용하지 않음 |
| `enterprise.deviceAttributes` | Directory 기기 ID만 읽음. 일련번호·위치·자산 번호는 불필요하여 읽지 않음 |
| `storage` | 읽기 전용 managed 설정, 로컬 진단·재시도 시간 저장. 토큰 저장 없음 |
| `alarms` | 기본 5분 주기. 하나의 이름으로 존재 여부와 간격 확인 |
| `management.getSelf()` | 자기 확장 installType 확인. `management` 권한 없이 호출 가능 |
| 단일 `host_permissions` | 지정 시험 서버 HTTPS 원점만 허용. 모든 사이트 권한 없음 |

`history`, `tabs`, `webNavigation`, `webRequest`, `scripting`, 콘텐츠 스크립트는 없습니다. 설치 사실·권한을 숨기는 코드는 없습니다.

기기 API는 정책 강제 설치된 ChromeOS에서만 사용할 수 있습니다. 사용자와 기기 조직 affiliation이 맞지 않으면 Directory ID가 빈 값일 수 있습니다. API 부재, 예외, 빈 문자열을 정상 기기로 바꾸지 않습니다. `installType=admin`은 정책 설치의 로컬 관찰값이며 서버가 원격 증명한 설치 유형은 아닙니다. 관리 콘솔의 강제 설치 정책과 함께 확인합니다. [기기 API 공식 문서](https://developer.chrome.com/docs/extensions/reference/api/enterprise/deviceAttributes), [management 공식 문서](https://developer.chrome.com/docs/extensions/reference/api/management)

ANY 프로필 옵션과 `interactive:false`를 사용합니다. 동기화가 꺼져도 기본 계정 정보가 존재할 수 있으나 토큰 발급까지 보장하지 않습니다. 이 앱은 승인 화면을 띄우는 fallback을 제공하지 않습니다. [identity 공식 문서](https://developer.chrome.com/docs/extensions/reference/api/identity)

알람은 절전 중 기기를 깨우지 않으며 깨어난 뒤 지연될 수 있습니다. 재시작마다 누락된 알람을 복원합니다. 별도의 타이머로 worker를 유지하지 않습니다. 실패 후 10→20→40→60분(기본 간격 기준)으로 요청을 제한하고 다음 예정 시각을 로컬에 저장합니다. 알람이 매 5분 깨어나도 예정 전 서버 요청은 하지 않습니다. 401은 캐시 토큰을 제거하고 다음 주기에 다시 비대화형 발급을 시도합니다. 403/503은 인증·대상·서버 설정 확인이 필요하며 오류를 숨기지 않습니다. 인터넷 복구는 다음 예정 알람에서 확인하므로 즉시 재연결을 보장하지 않습니다. [alarms 공식 문서](https://developer.chrome.com/docs/extensions/reference/api/alarms)

## 정책 설치 없이 로컬에서 확인할 수 있는 범위

개발자 본인 PC에서만 `chrome://extensions`의 개발자 모드로 `dist`를 불러올 수 있습니다. 한국어 진단 화면·버전·실행·프로필 정보(프로필 존재 시)·설정 누락 시 대기를 확인합니다. 학생 기기에 이 절차를 배포 방법으로 적용하지 않습니다. 이 상태의 installType은 development이며 ChromeOS 정책 전용 기기 API의 실제 성공을 검증할 수 없습니다.

일반 unpacked 설치에는 관리자 managed 설정이 없으므로 서버 전송은 안전 대기합니다. 저장소 local 값을 managed 대신 사용하는 우회 기능은 없습니다. 테스트 harness가 Chrome API와 Google 응답만 모의하여 실제 빌드 worker의 설정·인증 실패·POST 순서·backoff를 실행합니다. 이는 조직 정책·Google 최초 동의·ChromeOS API를 통과했다는 증거가 아닙니다. 실제 서버의 토큰 검증 확인에는 해당 client ID로 Google이 발급한 정상 토큰이 필요합니다. 운영 앱에 테스트 인증 우회 endpoint나 계정/기기 생성 기능은 없습니다.

## 학교 계정 목록은 있는데 Chrome 기기 목록이 비어 있을 때

사용자 디렉터리 조회 권한만 있다는 사실은 Chrome 기기 조회/설정 권한을 증명하지 않습니다. 교육청 상위 관리자에게 다음을 확인하도록 요청합니다.

1. ChromeOS 기기 조회 및 사용자/브라우저 앱·확장 정책 설정 권한과 관리자가 접근 가능한 학교 OU 범위. 현재 콘솔 필터·선택 OU를 포함해 확인합니다.
2. 학교 Chromebook이 어느 관리 고객/도메인으로 enterprise enrollment 되었는지와 관리 라이선스/업그레이드 상태. 학교 계정 로그인만으로 기기 등록이 완료되지는 않습니다.
3. 교육청 중앙 OU에 기기가 존재하나 학교 위임 관리자에게 보이지 않는지, 다른 조직으로 등록되었거나 등록 자체가 누락되었는지.
4. 학교 사용자가 등록된 기기의 조직과 affiliated 상태인지. 공식 Directory 기기 ID를 받아 승인 목록을 구성합니다.

기기가 등록되지 않았다면 **사용자 정책만으로 기존 비관리 기기를 enterprise enrollment시키거나 deviceAttributes를 보장할 수 없습니다.** 기존 학교/교육청 기기 관리 담당자가 등록 상태를 해결해야 합니다. 본 프로젝트는 각 기기를 켜서 수동 설치하는 것을 운영 방법으로 제시하지 않습니다. [기기 목록 공식 안내](https://support.google.com/chrome/a/answer/1698333), [관리자 위임 권한](https://support.google.com/chrome/a/answer/2984343), [기기 등록 안내](https://support.google.com/chrome/a/answer/1360534)

## 게시 준비와 OAuth

1. 조직 승인된 개발자 계정으로 Chrome Web Store Developer Dashboard를 사용할 수 있는지 확인합니다. 조직 내부 비공개 게시의 사용 가능 여부, 학교/교육청 게시 담당자, 심사·개인정보처리방침 준비를 확인합니다. 이미 통과했다고 가정하지 않습니다.
2. 먼저 기본 빌드/ZIP을 대시보드에 초안 업로드하여 Item ID와 공개 키를 확보합니다. 공개 키는 비밀키가 아닙니다. 개발자 PC의 unpacked 테스트에 동일 공개 키를 넣어 ID를 맞출 수 있습니다. 이 과정은 학생 기기 수동 설치가 아닙니다.
3. 조직에서 승인한 Google Cloud 프로젝트에 Google Auth Platform의 브랜딩/대상/데이터 접근을 설정합니다. 내부 대상 설정이 가능한 조직 소유 프로젝트인지 확인하고, 외부/테스트 모드라면 게시·테스트 사용자 및 교육용 연령 정책 제한도 확인합니다.
4. OAuth 클라이언트 유형 **Chrome Extension**을 선택하고 Item ID에 확정된 확장 ID를 연결합니다. 공개 client ID를 확장 빌드 `GOOGLE_CLIENT_ID` 및 서버 `.env`에 동일하게 넣습니다. 비밀키·client secret·서비스 계정은 확장에 넣지 않습니다.
5. scope는 `openid`와 `https://www.googleapis.com/auth/userinfo.email`입니다. People/Directory API 데이터 접근이나 전체 학생 명단 읽기 권한은 요청하지 않습니다.
6. 관리자 콘솔의 보안 → 액세스 및 데이터 관리 → API 제어 → 앱 액세스 제어에서 해당 **OAuth client ID**와 scope를 확인하고 시험 OU/대상에 허용되는지 교육청 관리자와 확인합니다. 미성년 계정의 서드파티 앱 접근 정책도 확인합니다.
7. 앱 접근 허용·신뢰 설정은 **학생의 최초 OAuth 동의까지 자동으로 해결된다는 보장이 아닙니다.** 강제 설치만으로 비대화형 발급이 성립한다고 가정하지 않습니다. 새 시험 계정/새 세션에서 학생 클릭·동의 없이 시험합니다. `OAuth consent required` 등 실패가 남으면 이번 조직에서 요구조건 미충족으로 기록합니다. 이미 학생이 수동 동의한 계정만 성공한 결과를 무조작 성공으로 보고하지 않습니다.

현재 무조작 인증 가능 여부는 미검증입니다. 최초 동의가 계속 필요하다면 관리자에게 조직 지원 인증·승인 방법 검토를 요청하고 2단계 기록 수집으로 진행하지 않습니다. 교사가 학생 대신 로그인하거나 공유 우회 키를 배포하는 방식으로 해결하지 않습니다. [확장 OAuth 설정 공식 절차](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth), [Workspace 앱 액세스 제어](https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data)

서버의 tokeninfo와 userinfo 검증은 시험 소규모 트래픽용 온라인 확인 방식입니다. Google 검사 실패 시 거부합니다. 인증 요청은 bearer token만 포함하며 상태 본문은 probe 통과 후 전송합니다. 서버는 상태 전송마다 다시 검증합니다. 인증 성공 이메일을 서버가 반환하면 확장은 로컬 Chrome 프로필과 대조합니다. [Google OAuth 설명](https://developers.google.com/identity/protocols/oauth2), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

## 서버 배치

개발은 README의 SQLite 설정으로 실행합니다. 실학생 시험에는 승인된 HTTPS 서버를 마련하고 reverse proxy 뒤에 uvicorn을 배치합니다. 유효한 TLS 인증서, 외부 요청 본문 4KB 제한, 인증 요청 rate limit, Authorization·토큰·요청 본문을 저장하지 않는 로그 설정을 적용합니다. 교사 HTTP Basic 비밀번호는 **서버에 해시로만** 저장하며 학생 확장/managed에는 포함하지 않습니다. 서버 기본 바인딩은 loopback이며 운영 접근은 HTTPS proxy를 통합니다. `/`, 웹 자산과 `/api/teacher/status` 모두 교사 인증을 요구합니다.

서버 `.env`의 `SCHOOL_ID`, `GOOGLE_CLIENT_ID`, `TEST_ACCOUNT_EMAILS`를 채웁니다. 허용 학생 목록이 비어 있으면 모두 거부합니다. 관리자는 시험 계정 이메일 2~3개만 지정합니다. `DEVICE_POLICY=diagnostic`은 **인증된 시험 계정에 한해 미확인 기기를 진단 상태로 전송**할 수 있습니다. 실제 기기 ID 확인 후 서버/managed에 동일한 허용 목록을 넣고 `allowlist`로 전환합니다. 허용 목록이 없는 allowlist 확장은 대기하고 서버도 거부합니다.

운영 기준 DB는 PostgreSQL입니다. 개발용 `compose.yaml`은 `POSTGRES_PASSWORD`를 별도로 요구하며 비밀번호가 기본 제공되지 않습니다. 실행 예:

```powershell
$env:POSTGRES_PASSWORD='로컬-개발용-별도-비밀번호'
docker compose up -d db
# server/.env DATABASE_URL을 postgresql+psycopg://pilot:비밀번호@127.0.0.1:5432/pilot로 변경
```

운영에서는 별도 DB 사용자·권한·백업을 관리합니다. 패스워드 URL에 예약 문자가 있으면 URL 인코딩합니다. PostgreSQL 연결 테스트는 아직 수행하지 않았습니다. 변경 시 SQLite 데이터를 자동 이전하지 않습니다. 서버 상태는 기기별 최근 값만 남으며 기본 14일 경과 데이터는 시작/새 상태 수신에서 정리되고 교사 조회에서 제외됩니다.

## 새로 확인한 ID 추가 팝업 반영

교사가 확인한 ID 입력·웹 스토어/맞춤 URL·저장 버튼을 `policy/environment-checklist.json`에 관찰 사실로 기록했습니다. 실제 저장·강제 설치는 미검증입니다. 입력값의 구분과 등록 저장 뒤 상세 패널에서 강제 설치를 저장하는 단계는 [DISTRIBUTION.md](DISTRIBUTION.md)를 따릅니다. 기존 웹 스토어 우선 경로 외에 담당자가 서명 키·HTTPS 호스트를 준비했을 때 사용할 자체 호스팅 도구와 운영 절차도 추가했습니다. 팝업의 존재는 학교 기기 식별·자동 인증의 근거로 사용하지 않습니다.

## 시험 그룹 정책 배포

1. **첫 행동:** 관리자 콘솔에서 시험 학생 2~3명만 포함한 별도 구성 그룹을 만듭니다. 최상위 조직·학교 전체를 대상으로 선택하지 않습니다.
2. 변경 전 해당 그룹/OU 앱 설치 정책과 상속값, 기존 그룹 우선순위를 기록합니다.
3. Chrome Web Store 조직 내부 게시 또는 승인된 게시가 완료된 후, 기기 → Chrome → 앱 및 확장 → 사용자 및 브라우저에서 해당 시험 그룹만 선택합니다.
4. 확정 확장 ID를 추가하고 설치 정책을 **강제 설치**로 설정합니다. 학생에게 진단 상태 접근이 쉬워야 한다면 도구 모음 고정 옵션을 선택합니다.
5. 확장 정책 JSON 입력에 `policy/admin-console.example.json`을 사용하고 실제 HTTPS 원점·학교 식별값으로 교체합니다. 이 파일은 `Value` 래퍼가 있는 콘솔 형식입니다. `policy/managed-values.example.json`은 storage.managed에 반환되는 원시 값의 예시입니다. 콘솔의 정책 입력 형식 안내와 스키마 검증 결과를 확인합니다.
6. 처음 `testEnabled=false`, `devicePolicy=diagnostic`으로 설치 여부·로컬 계정·기기 정보부터 확인합니다. 서버 학생 allowlist 및 OAuth 검증 설정이 끝난 후 시험 그룹만 `testEnabled=true`로 변경합니다.
7. 서버 원점은 빌드 허용 원점과 완전히 일치해야 합니다. `schoolId`와 기기 정책/목록은 서버 설정과 맞춥니다. 공개 JSON에는 교사 비밀번호·토큰을 넣지 않습니다.

사용자/그룹 설치 정책은 계정이 사용하는 다른 기기에도 적용될 수 있으므로 학교 기기 한정과 같은 뜻이 아닙니다. 확장은 ChromeOS·admin·Directory ID·allowlist를 함께 검사합니다. diagnostic 모드는 기기 불명 상태를 조사하기 위한 시험용 예외이며 정상 기기로 판정하지 않습니다. [사용자/그룹 일괄 강제 설치 공식 안내](https://support.google.com/chrome/a/answer/6306504), [설치 정책과 그룹 우선순위](https://support.google.com/chrome/a/answer/6177447)

## 실제 기기 검증표

각 시험 계정에 대해 아래 결과·Chrome 버전·시간·담당자를 기록합니다. 학생은 평소 학교 로그인만 합니다. 진단 화면 확인은 점검용이며 실행·인증을 위한 클릭은 요구하지 않습니다.

| 확인 | 통과 기준 |
|---|---|
| 설치 | 학생 조작 없이 설치, installType admin, 버전 일치, 정책 출처 확인 |
| 계정 | 동기화 켬/끔 각각 학교 기본 프로필 확인 또는 원인 표시 |
| 기기 | cros, 실제 Directory ID와 교육청 관리 목록 일치. 부재 시 needs_check |
| 최초 인증 | 새 시험 계정/세션에서 승인창·추가 로그인 없이 probe/POST 성공 |
| 무팝업 | 설치·로그인·수업·토큰 갱신 중 앱 창/승인창 자동 표시 없음 |
| 주기 | 15분 이상 켜 둔 기기에서 주기 연결 관찰, 최신 행 하나 갱신 |
| 재부팅 | 관리자 시험 담당자가 1대 재부팅 후 학생 평소 로그인만으로 연결 재개 |
| worker 중지 | 개발자 진단용 worker 중지/재시작 후 단일 알람 복구, 중복 요청 없음 |
| 절전 | 시험 기기 절전/복귀 후 예정 알람 재개. 지연을 학생 미사용으로 해석하지 않음 |
| 오프라인 | 네트워크 차단 후 연결 실패·backoff, 복구 후 예정 알람에서 연결 회복 |
| 토큰 만료/철회 | 401 토큰 제거 또는 비대화형 실패 표시. 승인창으로 우회하지 않음 |
| 서버 중지 | connection_failed·교사 전송 지연 표시, 복구 후 정상 조건 다시 검사 |
| 지정 기기 정책 | 학교 ID/기기 목록 불일치 시 정상 금지·allowlist 전송 거부 |

계정·기기·설정이 확인되고 서버가 같은 기기 조건을 승인한 경우에만 `시험 정상 동작`이 표시됩니다. 상세 로컬 오류는 서버로 보내지 않습니다. 복구 후 `previous_attempt_failed`만 전달하므로 교사는 학생 확장 진단을 확인합니다. 인증 전 실패한 학생은 웹 목록에 없을 수 있습니다. 서버는 학생 명단을 임의로 생성하지 않습니다.

## 실패 진단과 중지

비대화형 OAuth 실패: client ID와 게시 Item ID 연결, OAuth 대상 모드, 미성년 앱 정책, scope 차단, 기존 승인 여부, Chrome 기본 프로필 존재를 확인합니다. 학생 수동 동의가 필요한 상황은 무조작 요구 미충족입니다. 관리자 설정을 바꾸더라도 새 시험 세션에서 다시 검증해야 합니다.

기기 ID 없음: API 제공 여부, ChromeOS, installType, 기기 등록 조직, 사용자 affiliation을 순서대로 확인합니다. 가짜 UUID나 학생 ID를 생성하지 않습니다.

HTTP 401: 서버 client ID·scope·만료·검증 결과 확인. HTTP 403: 시험 계정/학교/서버 기기 목록 확인. HTTP 503: 서버 설정 또는 Google 검증 연결 확인. 연결 실패: 서버 HTTPS 인증서·호스트 일치·학교 네트워크 차단·서버 가동 확인. 상세 토큰을 콘솔에 출력하거나 문서에 붙이지 않습니다.

중지할 때 먼저 시험 그룹 `testEnabled=false`를 저장합니다. 전파 완료까지 진행 중 요청 1건이 도착할 수 있습니다. 즉시 차단이 필요하면 서버 시험 계정 목록을 비우고 서버를 재시작합니다. 이어 시험 그룹에서 이 확장을 차단/제거하고 원래 기록해 둔 상속 정책을 복원합니다. 그룹의 설정 해제와 OU의 상속 복원을 혼동하지 않습니다. 상위 정책이 이미 강제 설치라면 하위 설정 삭제만으로 중지되지 않을 수 있습니다. 다른 학교 정책은 변경하지 않습니다. 서버 데이터를 승인된 보관 정책에 따라 삭제하고 OAuth 허용도 원래 설정으로 복원합니다.

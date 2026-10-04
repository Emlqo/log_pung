# 현재 학생 배포: 0.2.3 ON/OFF

2026-10-04 교사 요청으로 학생 이메일 사전 등록, 기기 ID별 등록, 10분/200건 종료 제한을 제거했습니다. 대상은 관리자 콘솔의 시험 조직/그룹에 배포된 계정 프로필입니다. 개인 기기에 해당 정책으로 설치된 프로필도 포함됩니다. 서버는 Google 신원이나 정책 설치 주장 자체를 인증하지 않으며, 이메일·기기 조건은 클라이언트 주장으로 표시합니다.

## 관리자가 할 일

기존 확장 ID `apbdapifnlhfhoebphdafnpdopcgccmi`와 맞춤 업데이트 URL `https://log-pung.vercel.app/distribution/updates.xml`을 유지합니다. 학교 전체로 배포 범위를 확대하지 않습니다.

확장 정책 JSON을 `policy/student-selfhost-admin-console.json`으로 교체합니다. 이 파일은 Value 래퍼를 포함합니다. `devicePolicy`는 **policy**, `testEnabled`는 true입니다. 이 설정은 수집 가능한 배포 프로필을 선택하는 것이며 교사가 ON을 누르기 전에는 기록을 수집하지 않습니다. diagnostic 모드는 여전히 기록을 수집하지 않습니다. allowlist 모드는 선택적으로 유지됩니다.

학생 기기에서 chrome://policy → 정책 새로고침 후 확장 팝업 **버전 0.2.3**를 확인합니다. 자동 업데이트 반영 시간은 실제 기기에서 확인해야 합니다. 0.2.0은 새 ON/OFF 상태를 처리하지 못하므로 버전 확인이 필요합니다. 확장을 수동 설치하도록 안내하지 않습니다.

Vercel Production 환경변수:

- DATABASE_URL: 외부 PostgreSQL 실제 주소. 이 값은 비밀정보이며 저장소에 넣지 않습니다.
- SCHOOL_ID: school-pilot
- STUDENT_TEST_ENABLED: true
- TEACHER_PASSWORD_HASH: 교사 로그인용 기존 해시
- DEVICE_POLICY: 기본값 policy이므로 추가 입력하지 않아도 됩니다. policy에서는 기기 ID별 등록이 없습니다.
- TEST_ACCOUNT_EMAILS는 더 이상 사용하지 않습니다. 남아 있어도 학생 서버는 무시합니다.
- ALLOWED_DEVICE_IDS는 DEVICE_POLICY=allowlist일 때만 사용합니다.

환경변수 변경 후 새 배포가 필요합니다. /health의 configured는 설정 표시이고 DB 연결 성공 증명은 아닙니다. 교사 화면 조회가 되는지 확인하세요.

## 수집 사용

교사 사이트 https://log-pung.vercel.app 에 teacher 계정으로 로그인 → **ON · 수집 시작**. 학생 확장은 기본 5분 주기로 상태를 확인하며 아이콘 상태 확인으로 즉시 확인할 수 있습니다. ON은 PostgreSQL에 저장돼 서버 인스턴스가 바뀌어도 유지됩니다. 10분 자동 종료나 전체 200건 한도는 없습니다.

**OFF · 수집 중지** 후 서버는 새 요청을 거부하고 학생 확장은 다음 방문 전 OFF를 확인해 새 기록을 수집하지 않습니다. ON/OFF는 이 학교 식별값의 대상 프로필 전체에 적용합니다. 학생 계정 변경, 수동 설치, 설정 오류, 연결 오류에서는 수집을 중단합니다. 네트워크 실패 중의 활동은 놓칠 수 있고 그 공백은 미사용을 의미하지 않습니다. OFF 이후 새 ON은 별도의 수집 실행 ID를 만들어 이전 실행 요청을 거부합니다.

일반 주소의 쿼리·fragment, 페이지 내용, 이전 방문기록은 받지 않습니다. 지원 검색어만 별도 항목으로 받습니다. 요청당 20건 및 미전송 대기열 200건은 메모리 제한으로 유지하며 성공한 전송은 큐에서 제거합니다. 최근 1일 데이터를 보관·조회하고 화면은 최신 600건을 표시합니다. 만료 삭제는 서버 초기화와 새 기록 수신 때 실행하며 별도 상시 삭제 스케줄은 없습니다. 정기 보고서는 이번 변경에서 구현하지 않았습니다.

## 중지·복원

교사 OFF → managed testEnabled=false. 설치 제거가 필요하면 시험 조직/그룹의 설치 정책을 차단으로 바꿉니다. 원래 정책 복원은 그룹 설정 해제/조직 상속으로 처리하고 상위 강제 설치 정책을 확인합니다. 옮긴 학생은 기록해 둔 원래 조직으로 복원합니다.

## 서명과 호스팅

CRX3 서명 키는 이 PC의 C:/Users/User/.codex/private-keys/classroom-pilot-student.pem에 담당자 전용 ACL로 보관합니다. GitHub, Vercel, 프로젝트 ZIP에 포함하지 않습니다. 담당자는 암호화된 별도 백업을 보관하세요. 동일 키로 서명해야 ID가 유지됩니다.

버전 변경 → PILOT_SERVER_ORIGIN=https://log-pung.vercel.app로 build:student → selfhost:student에 기존 key 경로와 --base-url https://log-pung.vercel.app/distribution 지정 → verify-crx 파일경로 --student. 동일 버전 CRX 덮어쓰기는 거부됩니다. server/distribution에 있는 공개 CRX와 XML만 서버에서 제공하며 비밀 파일은 제공하지 않습니다.

실제 학교에서 0.2.0 정책 설치 admin·학교 이메일·Directory 기기 ID 읽기가 교사에게 확인됐습니다. 0.2.3 자동 업데이트와 실제 ON/OFF 수집, 재부팅·절전·장시간 연결 복구는 추가 현장 검증이 필요합니다.

[관리자 콘솔 정책 Value 형식](https://www.chromium.org/administrators/configuring-policy-for-extensions/), [맞춤 URL로 확장 추가](https://support.google.com/chrome/a/answer/6177447?hl=ko)

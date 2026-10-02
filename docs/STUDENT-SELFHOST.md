# 학교 크롬북: 웹스토어 없이 첫 설치 시험

이 문서의 ID는 로컬에서 실제 RSA 키로 서명한 CRX의 ID입니다. URL은 선생님이 확인한 Vercel Production 원점입니다. 웹스토어 게시나 심사를 사용하지 않습니다. 실제 학교 정책 적용과 ChromeOS 설치는 아직 현장 검증이 필요합니다.

## 관리자 화면에 입력할 값

- 시험 계정 2~3명만 포함한 그룹 선택. 전체 조직은 선택하지 않습니다.
- **ID로 Chrome 앱 또는 확장 프로그램 추가**를 엽니다. **URL로 추가(PWA)**는 다른 기능입니다.
- 확장 프로그램 ID: `apbdapifnlhfhoebphdafnpdopcgccmi`
- 배포 출처: **맞춤 URL에서 추가**
- 맞춤 URL: `https://log-pung.vercel.app/distribution/updates.xml`
- 저장 후 확장 상세의 **설치 정책 → 강제 설치 → 저장**.
- 확장 정책 JSON 입력란에 `policy/student-selfhost-diagnostic.json` 내용을 붙여넣고 저장합니다. 서버 주소, 학교 ID, 시험 활성화와 **diagnostic** 모드가 들어 있습니다. JSON 파일을 URL 입력란에 넣지 않습니다.

먼저 위 업데이트 URL이 로그인 없이 XML을 반환하고 XML의 CRX URL이 실제 바이너리를 반환해야 합니다. 교사 화면은 계속 로그인으로 보호됩니다. Vercel 배포 보호가 다운로드를 로그인 페이지로 돌리면 관리자가 승인한 공개 배포 경로가 필요하며, 확장에 공용 보호 우회 키를 넣지 않습니다.

## 실제 기기에서 확인

1. 시험 학생이 학교 계정으로 크롬북에 로그인합니다. 정책 적용을 기다립니다. 즉시 확인하려면 `chrome://policy`에서 **정책 새로고침** 후 확장 설치 정책 상태를 확인합니다. 적용 소요 시간은 조직 환경에서 확인해야 합니다.
2. `chrome://extensions`에서 **학교 이메일 수집 시험 0.2.0**이 조직에 의해 설치되었는지 확인합니다. 개발자 모드 수동 설치로 대체하지 않습니다.
3. 확장 아이콘을 클릭해 이메일, **정책 설치: admin**, 학교 기기 ID를 확인합니다. **diagnostic 모드에서는 방문·검색을 수집하지 않습니다.** 서버 설정 미완료라도 로컬 진단의 이메일·기기·오류를 볼 수 있습니다.
4. 기기 ID가 비어 있으면 ChromeOS 관리 등록, 사용자와 기기의 조직 affiliation, 관리자 조회 범위를 확인합니다. 학생 사용자 목록이나 ID 추가 팝업만으로 기기 등록을 판단하지 않습니다. 가짜 기기 ID를 생성하거나 조건을 우회하지 않습니다.
5. 재부팅 후 설치가 유지되고 주기 실행이 다시 시작되는지 확인합니다. 인터넷 끊김/복구 시험에서 마지막 연결 없음은 미사용을 의미하지 않습니다.

설치가 안 되면 `chrome://policy`의 ExtensionSettings/ExtensionInstallForcelist 관련 상태, 실제 그룹 구성원과 상속 우선순위, 맞춤 URL 오타, HTTP 상태/MIME, CRX ID·서명 일치를 확인합니다. 현장 오류 문구를 그대로 기록합니다.

## 설치 후 10분 수집 시험

2026-10-02 최초 외부 확인 시 `/health`는 서버 실행 중이나 `configured:false`였습니다. 이 값은 배포 파일 제공을 막지 않지만 상태 전송·수집은 준비되지 않았음을 뜻합니다.

- 서버 DATABASE_URL, TEACHER_PASSWORD_HASH, 시험 이메일 2~3개, SCHOOL_ID, STUDENT_TEST_ENABLED를 확인합니다. `/health`의 configured는 간단한 설정 표시이며 실제 DB 연결 성공의 증명이 아닙니다. 교사 화면에서 DB 접근을 확인합니다.
- 실제 기기 ID를 서버 `ALLOWED_DEVICE_IDS`와 확장 managed `allowedDeviceIds`에 넣습니다. managed `devicePolicy`를 `allowlist`로 변경합니다. 서버 환경변수 변경 후 새 Vercel 배포가 필요합니다.
- 교사 화면 **10분 수집 시험 시작** 후 학생이 시험용 검색·방문을 합니다. 확장 주기 확인은 기본 5분이며 아이콘의 상태 확인 버튼으로 바로 확인할 수도 있습니다. 교사 화면의 이메일별 기록을 확인하고 시험 중지합니다.
- 이메일과 기기 ID는 클라이언트 주장이고 본인·기기 인증이 아닙니다. 이번 학생 버전은 교사의 변경 요청에 따라 학생 OAuth를 사용하지 않습니다. 수집은 10분/계정당 200건이며 학생에게 상태와 수집 사실을 표시합니다.

## 중지·키 관리·업데이트

교사 화면에서 시험 중지하고 managed `testEnabled=false`로 저장합니다. 설치를 제거하려면 시험 그룹의 설치 정책을 **차단**으로 저장합니다. 기존 정책을 복원하려면 그룹 **설정 해제(Unset)**/OU **상속**을 사용하되 상위 강제 설치 정책이 남아 있는지 확인합니다.

서명 키는 이 PC의 `C:/Users/User/.codex/private-keys/classroom-pilot-student.pem`에 담당자 전용 파일 ACL로 보관했습니다. **GitHub·Vercel·프로젝트 ZIP에 들어 있지 않습니다.** 담당자는 암호화한 별도 백업을 보관하세요. 같은 키로 서명해야 ID가 유지됩니다. 키 분실·교체 시 ID가 바뀌어 정책 재등록이 필요합니다.

업데이트 시 `student-test/manifest.json` 버전을 올린 후 실제 서버 원점으로 빌드합니다.

```powershell
$env:PILOT_SERVER_ORIGIN='https://log-pung.vercel.app'
npm.cmd run build:student
npm.cmd run selfhost:student -- --key C:/Users/User/.codex/private-keys/classroom-pilot-student.pem --base-url https://log-pung.vercel.app/distribution
node scripts/verify-crx.mjs server/distribution/student-email-test-새버전.crx --student
```

이 명령의 `새버전`은 실제 버전으로 바꾸는 자리입니다. 버전별 CRX를 먼저 배포하고 업데이트 XML을 마지막에 바꿉니다. 이 Vercel 구성은 동일 배포에 파일을 포함합니다. 동일 버전의 다른 CRX 덮어쓰기는 거부합니다. 서명 검증 통과는 ChromeOS 실제 설치 성공을 의미하지 않습니다.

[Google 관리자 콘솔 ID·맞춤 URL 추가](https://support.google.com/chrome/a/answer/6177447?hl=ko), [강제 설치와 시험 그룹](https://support.google.com/chrome/a/answer/6306504?hl=ko), [업데이트 XML·CRX 호스팅 형식](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)

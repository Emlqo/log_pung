# 확인한 ID 추가 화면에 맞춘 배포 방법

현재 확인된 사실은 교사가 **ID로 Chrome 앱 또는 확장 프로그램 추가** 팝업, ID 입력란, Chrome 웹 스토어/맞춤 URL 선택, 저장 버튼을 보았다는 것입니다. 저장 성공·강제 설치·기기 API·자동 인증은 아직 확인되지 않았습니다. 학생 목록은 보이고 기기 목록은 비어 있다는 상태를 `policy/environment-checklist.json`에 기록했습니다. 실제 ID와 URL은 아직 null입니다.

## 두 방법 비교와 조건부 추천

| 항목 | Chrome 웹 스토어 게시 후 ID 추가 | 자체 호스팅 후 맞춤 URL 추가 |
|---|---|---|
| 게시물 | 개발자 대시보드에 ZIP 제출 | 담당자가 서명한 CRX3와 업데이트 XML |
| ID 확보 | 대시보드 Item ID, 공개 키로 대조 | 담당자 서명 공개 키의 해시에서 파생 |
| 팝업 출처 | Chrome 웹 스토어에서 추가 | 맞춤 URL에서 추가 |
| URL | ID로 검색/등록. 별도 맞춤 URL 입력 없음 | 업데이트 XML의 실제 HTTPS URL |
| 배포 운영 | 스토어가 서명·호스팅·업데이트 제공 | 학교/교육청이 HTTPS·서명 키·버전·업데이트 관리 |
| 외부 절차 | 개발자 등록, 조직 게시 권한, 제출·심사·게시 | 외부 확장 허용 정책, 조직 관리 조건, HTTPS 호스트, 안전한 키 관리 |
| 공개 범위 | 조직 비공개 또는 승인된 테스터 배포 검토. 비공개도 심사 | 설치용 파일에 학생 로그인/쿠키를 요구하지 않는 호스팅. 파일 안에 비밀정보 없음 |
| 정책 적용 범위 | 시험 구성 그룹 2~3명 | 동일한 시험 구성 그룹 2~3명 |

**조건부 추천은 조직 비공개 Chrome 웹 스토어 방식입니다.** 직접 HTTPS 배포·서명 키 운영 부담을 줄일 수 있기 때문입니다. 조직 게시 권한·대상 공개 범위와 심사를 확인한 뒤 사용합니다. 웹 스토어가 조직상 불가능하고 교육청이 자체 호스팅 운영을 승인한 경우에만 자체 호스팅을 대체 경로로 선택합니다. 현재 확인한 팝업만으로 어느 방법이 실제 설치 가능하다고 결론 내리지 않습니다.

ChromeOS 공식 문서는 웹 스토어와 자체 호스팅을 배포 방법으로 안내하며, 자체 호스팅 관리 배포에는 XML 매니페스트 URL을 전달하도록 설명합니다. 관리 정책에서 외부 확장·권한을 차단할 수 있습니다. 일반 사용자의 웹 스토어 외 설치 제한에 관한 Linux 문서를 관리 ChromeOS 전체에 그대로 적용하면 안 됩니다. 이 프로젝트는 **정책을 통한 관리 ChromeOS 시험**이며 학생의 개발자 모드·수동 CRX 설치를 운영 방법으로 사용하지 않습니다. [ChromeOS 공식 배포 안내](https://developers.google.com/chromeos/app-development/learn/extensions), [관리 콘솔 ID·맞춤 URL 추가](https://support.google.com/chrome/a/answer/6177447)

배포 방법과 관계없이 이 확장은 Chrome 120 이상을 요구합니다. 기기 API는 ChromeOS·정책 강제 설치·사용자 affiliation 조건이 별도로 필요합니다. 기기 목록 공백은 미등록 또는 관리자 OU/권한/필터 문제 등 여러 가능성이 있어 원인을 확인해야 합니다. 학생 계정 디렉터리가 보인다는 사실은 기기 조직 연결 증명이 아닙니다. OAuth client ID·조직 앱 접근 정책·최초 동의 역시 별도 조건입니다. [기기 API 조건](https://developer.chrome.com/docs/extensions/reference/api/enterprise/deviceAttributes), [기기 목록/권한](https://support.google.com/chrome/a/answer/1698333)

교육청 담당자와 확인할 체크리스트:

1. 선택할 **시험 구성 그룹**이 있고 이 그룹에 앱 등록·정책 저장·강제 설치 권한이 있는가?
2. 게시자가 조직 비공개 게시를 사용할 수 있는가? 없다면 승인된 다른 게시자/테스터 방식이 있는가?
3. 자체 호스팅을 선택한다면 외부 확장 차단·권한 차단·update URL 정책이 이 그룹에 어떻게 적용되는가?
4. 시험 Chromebook Chrome 버전, enterprise enrollment의 조직, 관리자 조회 OU, 사용자 affiliation은 무엇인가?
5. 별도 OAuth 설정 후 최초 학생 조작 없이 토큰 발급이 가능한가? 성공 여부는 실제 새 계정/세션으로 확인한다.

## 웹 스토어 준비와 실제 ID 확보

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run zip
```

`classroom-pilot-0.1.0.zip`은 게시용 ZIP입니다. 현재 파일은 실제 서버·OAuth 미설정의 안전 대기 빌드입니다. 이 ZIP을 조직 승인된 개발자 대시보드에 **초안 업로드**하여 Item ID와 Package → View public key를 확보할 수 있습니다. 초안 ID를 얻었다고 설치 가능하거나 심사가 끝난 것은 아닙니다.

확정 ID는 대시보드의 Item ID에서 복사합니다. 게시 후 항목 URL의 마지막 32자 ID도 대조하고, 같은 공개 키로 개발자 PC에서 불러온 확장 ID와 비교합니다. 로컬 폴더 위치만으로 생성된 임의 unpacked ID를 게시 ID로 사용하지 않습니다. 상세 순서는 [Google OAuth/Item ID 공식 절차](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth)에 있습니다.

이 ID에 연결한 Chrome Extension OAuth client를 만들고 실제 서버 원점과 함께 재빌드합니다. `EXTENSION_PUBLIC_KEY`는 대시보드 **공개** SPKI DER의 한 줄 base64입니다. 비밀키를 넣으면 빌드가 거부합니다.

```powershell
$env:PILOT_SERVER_ORIGIN='실제 승인된 HTTPS 서버 원점'
$env:GOOGLE_CLIENT_ID='실제 Chrome Extension OAuth client ID'
$env:EXTENSION_PUBLIC_KEY='대시보드 공개 키 한 줄 base64'
npm.cmd run build
npm.cmd run zip
# 공개 키는 UTF-8 텍스트 파일에 저장 가능. 비밀키와 구분.
npm.cmd run store:inputs -- --id 실제32자ItemID --public-key-file 공개키텍스트파일경로
```

위 `실제…` 문자열은 자리표시자이며 실행 가능한 값이 아닙니다. 마지막 명령은 ID 형식·공개 키 일치를 검사해 `release/webstore/deployment-inputs.json`을 만듭니다. 온라인 게시·심사 상태는 검증하지 않으며 false로 표시합니다. `docs/STORE-SUBMISSION.md`에 목록 문구·권한 설명·개인정보처리방침 초안과 제출 체크리스트가 준비되어 있습니다. 실제 연락처·지원/정책 URL·브라우저 스크린샷은 게시 담당자가 준비해야 합니다.

개발자 등록 → 초안 업로드 → ID/OAuth 연결·최종 패키지 → 목록·Privacy practices·배포 공개 범위 → 심사 제출 → 승인·게시 확인 순서입니다. 조직 비공개 게시 권한이 없으면 교육청 게시 담당자에게 설정/게시를 요청합니다. 임의 공개 게시로 바꾸지 않습니다. 비공개 게시 자체가 학교 전체 설치는 아니며 강제 설치 대상은 별도 시험 그룹으로 한정합니다. [스토어 게시 절차](https://developer.chrome.com/docs/webstore/publish), [조직 게시 권한·심사](https://developer.chrome.com/docs/webstore/cws-enterprise)

## 자체 호스팅 구성과 서명 키

자체 호스팅에도 ZIP을 제출하거나 교사 대시보드 URL을 등록하는 방식은 사용하지 않습니다. **담당자가 보관한 RSA 서명 키로 만든 CRX3 + HTTPS 업데이트 XML + XML이 가리키는 HTTPS CRX 파일**이 필요합니다.

새 배포 키는 학교/교육청 담당자가 안전한 별도 경로에서 생성·보관합니다. 기존 CRX를 업데이트할 때는 새 키를 생성하지 않고 반드시 기존 키를 사용합니다.

```powershell
# 프로젝트 루트에서 실행. work/는 개발자 작업용이며 운영 키 보관소가 아님.
# 실제 운영에서는 담당자 전용 보안 저장소 경로를 지정할 것.
npm.cmd run keygen -- ../../work/signing/pilot.pem
```

생성기는 출력 산출물 폴더에 키 저장을 거부하고 기존 키를 덮어쓰지 않습니다. Unix 권한 0600을 지정하지만 Windows 전용 ACL은 자동 보장하지 않습니다. 담당자 전용 ACL·암호화 백업·복구 책임자를 별도로 지정합니다. 키를 확장, 웹 서버, 소스 ZIP, managed 정책, Git에 넣지 않습니다. 키가 바뀌면 ID도 바뀌므로 OAuth 연결·관리 정책을 같은 ID로 유지할 수 없습니다. 스토어 공개 키만으로 같은 ID의 자체 서명을 만들 수 없습니다.

1. `npm.cmd run key:info -- 실제서명PEM경로`로 실제 서명 키에서 파생한 ID와 공개 키를 확인합니다. HTTPS 호스트나 CRX를 먼저 만들 필요가 없으며 비밀키 내용은 출력하지 않습니다.
2. 그 ID에 연결한 OAuth client ID를 만들고 시험 서버 원점을 넣어 다시 `npm run build`를 실행합니다. 스토어용 `EXTENSION_PUBLIC_KEY`가 남아 있으면 제거하세요. 다른 공개 키가 들어 있으면 자체 서명 도구가 거부합니다.
3. 동일 키·실제 배포 폴더 HTTPS 주소로 최종 CRX를 생성합니다. 변경된 동일 버전 CRX 덮어쓰기는 거부하므로 이미 만들어진 CRX에서 코드/설정을 바꿀 때는 버전을 올립니다.

```powershell
Remove-Item Env:EXTENSION_PUBLIC_KEY -ErrorAction SilentlyContinue
npm.cmd run build
npm.cmd run selfhost -- --key 실제서명PEM경로 --base-url 실제HTTPS배포폴더주소
npm.cmd run verify:crx -- release/selfhost/출력된실제ID/classroom-pilot-버전.crx
```

`--base-url`에는 파일 URL이 아닌 실제 HTTPS 배포 폴더를 지정합니다. 예시 `https://distribution.school.example/extensions/pilot`은 설명용 예약 주소라 도구가 거부합니다. 자격증명·쿼리 토큰을 주소에 넣지 않습니다. 생성 결과:

- `classroom-pilot-버전.crx`: RSA PKCS#1 SHA-256으로 서명된 CRX3. manifest의 key와 update_url 포함.
- `updates.xml`: 실제 appid, 같은 버전, HTTPS CRX codebase를 포함한 Google update2 XML.
- `deployment-inputs.json`: 관리자 팝업에 입력할 실제 ID와 **updates.xml URL**, CRX URL, SHA-256, 외부 검증 false 상태.

생성 위치는 `release/selfhost/실제ID/`입니다. 키는 포함하지 않습니다. 도구는 Chromium의 CRX3 헤더 및 서명 생성 규약을 구현하고 생성한 패키지의 서명·ID·manifest를 다시 검사합니다. 독립 파서/Node RSA 검증 및 변조 거부 테스트도 수행했습니다. **이 서명 검증은 ChromeOS 정책 설치 실증을 대체하지 않습니다.** 필요하면 개발자 PC에서 공식 Chrome `--pack-extension` / `--pack-extension-key`로도 동일 키의 패키징을 확인할 수 있습니다. 학생 기기마다 실행하는 절차가 아닙니다. [CRX3 형식](https://raw.githubusercontent.com/chromium/chromium/main/components/crx_file/crx3.proto), [Chromium 서명 생성 구현](https://raw.githubusercontent.com/chromium/chromium/main/components/crx_file/crx_creator.cc)

## HTTPS 게시·업데이트

학교/교육청 승인된 별도 정적 HTTPS 호스트에 **XML과 CRX만** 게시합니다. `deploy/selfhost/nginx.conf.example`에 정확한 MIME·다운로드 경로 분리 예시를 준비했습니다. DNS·유효한 TLS 인증서·실제 디렉터리는 운영자가 준비해야 합니다. 개인정보가 있는 교사 화면/API는 계속 인증을 요구하며 이 정적 다운로드 호스트와 분리합니다.

| 파일 | Content-Type | 인증/업데이트 조건 |
|---|---|---|
| updates.xml | application/xml | 학생 로그인·쿠키 없이 가져오기, no-cache, 실제 XML 응답 |
| 서명된 .crx | application/x-chrome-extension | XML의 codebase와 일치, 실제 CRX 바이트, 변경 없는 버전 파일 |

HTTPS 인증서·리다이렉트 없는 200 응답, 학교 네트워크에서 접근, 프록시가 MIME/파일을 바꾸지 않음을 확인합니다. `X-Content-Type-Options: nosniff`를 쓰므로 CRX의 정확한 MIME을 반드시 설정합니다. 자동 업데이트 검사에는 쿠키 인증을 기대하지 않습니다. 배포 URL용 추가 host permission은 필요하지 않으며 Chrome의 설치/업데이트 경로가 처리합니다. 이 확장의 서버 host permission은 진단 API 한 원점으로 유지합니다.

업데이트는 같은 키·같은 ID로 manifest version을 증가시켜 CRX를 만들고 **CRX를 먼저 업로드**, 준비된 XML을 마지막에 원자적으로 교체합니다. XML 버전은 CRX manifest와 같아야 합니다. 예전 버전 번호를 낮춘 rollback은 보통 업데이트로 선택되지 않으므로 시험을 중지하고 필요하면 수정 패키지를 더 높은 버전으로 제공합니다. 정책의 최초 설치 URL과 패키지 내 update_url도 같은 XML로 유지합니다. [서명·업데이트 XML·MIME 공식 문서](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)

## 지금 확인한 관리자 팝업에 입력할 값과 강제 설치 순서

1. 팝업을 저장하기 전에 상위 화면의 **사용자 및 브라우저 → 시험 구성 그룹 2~3명**을 선택했는지 확인합니다. 전체 조직·전체 학교 OU는 선택하지 않습니다. 팝업이 전체 조직에서 열렸다면 닫고 시험 그룹에서 다시 엽니다.
2. `ID로 Chrome 앱 또는 확장 프로그램 추가`를 엽니다.
3. 웹 스토어 경로: ID란에 **실제 승인·게시된 Item ID** → `Chrome 웹 스토어에서 추가` → 저장. ZIP 경로·OAuth client ID는 ID가 아닙니다.
4. 자체 호스팅 경로: ID란에 **실제 서명 키에서 나온 extensionId** → `맞춤 URL에서 추가` → URL란에 **실제 HTTPS updates.xml URL** → 저장. .zip/.crx 직접 URL·교사 웹사이트 주소를 넣지 않습니다.
5. 저장 후 목록에 등록된 해당 확장을 클릭합니다. 오른쪽 상세 설정 패널의 **설치 정책 / Installation policy**에서 **강제 설치 / Force install** 또는 **강제 설치 및 브라우저 도구 모음 고정**을 선택합니다. `사용자가 사용 중지 가능` 옵션은 이번 자동 작동 시험 목적에 맞지 않습니다. `허용 설치`만 선택하면 자동 설치 시험이 아닙니다.
6. 이 상세 패널의 저장을 누릅니다. **팝업 등록 저장과 강제 설치 정책 저장은 별도 단계**입니다. 시험 그룹 이름·등록 ID·설치 정책을 확인합니다.
7. 확장 정책 JSON에 실제 시험 서버 원점·학교 식별값을 입력하되 먼저 `testEnabled=false`, `devicePolicy=diagnostic`을 적용합니다. 그룹 정책 전파와 로컬 admin 설치/버전/기기 상태부터 확인합니다.
8. 서버 학생 2~3명 allowlist와 OAuth 조건을 준비한 뒤 같은 시험 그룹만 `testEnabled=true`로 바꿉니다. 새 시험 계정/세션에서 추가 로그인·동의창 없이 인증되는지 확인합니다. 기기 목록이 비어 있는 한 학교 기기 확인 완료라고 보고하지 않습니다.
9. 실제 Directory ID와 조직 연결 확인 후 허용 목록을 서버·managed에 맞추고 allowlist로 전환합니다. 강제 설치/기기/API/인증/재부팅 결과를 각각 기록합니다. 중지는 기존 DEPLOYMENT.md 절차를 따릅니다.

이 메뉴 순서는 [관리 콘솔 공식 추가/설정 절차](https://support.google.com/chrome/a/answer/6177447)와 [강제 설치 절차](https://support.google.com/chrome/a/answer/6306504)에 근거합니다. 설치 정책 선택이 보이지 않거나 저장 실패하면 위임 관리자 권한·시험 그룹 범위·상위 정책을 확인해야 합니다. 해당 UI가 보인다는 이유만으로 권한 성공을 주장하지 않습니다.

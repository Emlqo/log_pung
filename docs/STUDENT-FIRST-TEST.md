# 실제 학생 Chromebook 첫 시험 — 짧은 안내

**후속 변경(2026-10-02):** 교사가 학생 OAuth 생략과 GitHub/Vercel 배포를 선택하여 별도 학생 이메일 시험 버전을 추가했습니다. 최신 절차는 [VERCEL-QUICKSTART.md](VERCEL-QUICKSTART.md)입니다. 아래는 앞서 준비한 OAuth 진단 서버 배치 기록입니다.

교사 화면에는 **Google 인증이 검증된 `@goedu.kr` 이메일**을 표시합니다. 이름·반·세션 번호로 식별할 필요는 없습니다. 현재 `server/app.py`의 진단 화면은 이미 이 방식입니다.

## 현재 가능한 범위

- 선생님 PC: 직접 시작한 10분 수집·서버 수신 확인을 완료했습니다(사용자 확인).
- 학생 Chromebook: 정책 설치·계정·기기·비대화형 인증 **진단 버전**이 준비되어 있습니다.
- 학생 검색·방문 수집 버전: 아직 구현·배포하지 않았습니다. 본인 PC 시험 버전을 학생에게 배포하지 않습니다.
- 실제 HTTPS 주소·게시 확장 ID·학교 OAuth client ID: 아직 확보/확인되지 않았습니다.

## 다음 행동

학교/교육청 서버 담당자에게 **“시험 학생 2~3명의 Chrome 확장 진단용 FastAPI 서버를 올릴 Linux 서버와 HTTPS 도메인을 사용할 수 있는지”** 확인하세요. Docker Compose를 사용할 수 있는 서버용 구성을 `deploy/school-server`에 준비했습니다. 이미 운영 중인 학교 HTTPS proxy를 사용할 수도 있습니다.

## 서버 담당자용 실행

1. 승인된 서버에 프로젝트를 복사합니다. 실제 도메인의 DNS를 그 서버로 연결하고 80/443 접근을 설정합니다. DB와 FastAPI 포트는 외부에 공개하지 않습니다.
2. `deploy/school-server`에서 `.env.example`을 `.env`로 복사합니다. 실제 DNS 이름, Chrome Extension OAuth client ID, 시험 학교 계정 **2~3개**를 입력합니다. 예시/빈 주소로 실행하지 않습니다. 이 OAuth client ID는 게시 확장 ID에 연결하고 확장 빌드 값과 같아야 합니다.
3. `secrets` 디렉터리를 만들고 서버 전용 DB 비밀번호(20자 이상)를 `secrets/db-password.txt`에 저장합니다. `server/scripts/password.py`로 만든 scrypt 해시만 `secrets/teacher-hash.txt`에 저장합니다. 파일은 서버 담당자만 읽도록 권한을 제한합니다. 학생/확장/정책에는 두 파일을 넣지 않습니다. 프로젝트 ZIP에도 포함되지 않습니다.
4. 다음을 실행합니다.

```sh
docker compose --env-file .env -f compose.json up -d --build
```

5. 실제 `https://발급된도메인/health`가 `diagnostic-only`를 반환하는지 확인합니다. 실제 `https://발급된도메인/`은 로그인 없이 401이어야 하고, `teacher`와 교사 비밀번호로 진단 화면에 접속해야 합니다. **위 URL은 형식 설명이며 실제 발급 주소가 아닙니다.**
6. 같은 HTTPS 원점으로 확장을 빌드하고 웹 스토어 게시 또는 서명 CRX 자체 호스팅을 준비합니다. 시험 계정 2~3명 그룹에만 강제 설치합니다. 콘솔의 ID 추가 후 설치 정책 설정은 [DISTRIBUTION.md](DISTRIBUTION.md)를 따릅니다. FastAPI 주소는 CRX 업데이트 URL이 아닙니다.
7. 학생이 학교 계정으로 로그인했을 때 진단 화면의 이메일, 정책 설치, 실제 기기 ID, 서버 인증을 확인합니다. 인증 실패 시 이메일만 전송하거나 공용 키로 우회하지 않습니다. 진단 상태에서 기기 확인이 실패하면 정상 대상이라고 표시하지 않습니다.

## 시험 중지

먼저 시험 그룹의 managed `testEnabled`를 false로 변경하고 설치 정책을 기존 값으로 복원합니다. 서버는 `docker compose --env-file .env -f compose.json down`으로 중지합니다. `down -v`는 DB·인증서까지 삭제하므로 일반 중지에 사용하지 않습니다.

## 검증 범위

서버 인증·이메일 표시와 구성 누락 거부는 로컬 테스트로 확인합니다. 이 작업 환경에는 Docker가 없어 컨테이너 빌드·PostgreSQL 실접속·Caddy 실구동은 미검증입니다. 외부 서버/도메인 발급, TLS 인증서, OAuth 최초 비대화형 발급, 실제 정책 설치/재부팅은 아직 수행하지 않았습니다. 컨테이너 설정 파일을 준비한 것을 실제 게시·배포 완료라고 보고하지 않습니다.

[Caddy 자동 HTTPS 요건](https://caddyserver.com/docs/automatic-https), [Docker Compose secret 파일](https://docs.docker.com/compose/how-tos/use-secrets/), [Chrome 비대화형 인증](https://developer.chrome.com/docs/extensions/reference/api/identity)

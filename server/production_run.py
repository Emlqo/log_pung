"""Approved HTTPS host entry point; refuses incomplete pilot configuration."""
import os
import re
from pathlib import Path
from sqlalchemy.engine import URL
from app import Settings, create_app

def production_settings(env=None, read_secret=None):
    env = os.environ if env is None else env
    read_secret = (lambda path: Path(path).read_text(encoding='utf-8').strip()) if read_secret is None else read_secret
    domain = env.get('PILOT_DOMAIN', '')
    if not re.fullmatch(r'(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}', domain):
        raise ValueError('실제 서버 DNS 이름 필요')
    lower = domain.lower()
    if lower.endswith(('.invalid', '.example', '.test', '.localhost', '.local', '.internal')) or any(lower == x or lower.endswith('.'+x) for x in ('example.com','example.org','example.net')):
        raise ValueError('예시 주소는 배포할 수 없음')
    client = env.get('GOOGLE_CLIENT_ID', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]+\.apps\.googleusercontent\.com', client):
        raise ValueError('실제 Chrome Extension OAuth client ID 필요')
    school = env.get('SCHOOL_ID', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', school): raise ValueError('학교 식별값 필요')
    accounts = tuple(x.strip().lower() for x in env.get('TEST_ACCOUNT_EMAILS','').split(',') if x.strip())
    if len(accounts) not in (2,3) or len(set(accounts)) != len(accounts) or any(not re.fullmatch(r'[^@\s]+@goedu\.kr', x) for x in accounts):
        raise ValueError('서로 다른 시험 학교 계정 2~3개만 지정')
    policy = env.get('DEVICE_POLICY', 'diagnostic')
    ids = tuple(x.strip() for x in env.get('ALLOWED_DEVICE_IDS','').split(',') if x.strip())
    if policy not in ('diagnostic','allowlist') or (policy == 'allowlist' and not ids):
        raise ValueError('기기 정책과 실제 승인 기기 목록 확인 필요')
    password = read_secret(env.get('POSTGRES_PASSWORD_FILE',''))
    teacher_hash = read_secret(env.get('TEACHER_PASSWORD_HASH_FILE',''))
    if len(password) < 20: raise ValueError('DB 전용 비밀번호 20자 이상 필요')
    if not re.fullmatch(r'[a-f0-9]{32}:[a-f0-9]{128}', teacher_hash): raise ValueError('교사 비밀번호 scrypt 해시 필요')
    database_url = URL.create('postgresql+psycopg',username='pilot',password=password,host='db',database='pilot').render_as_string(hide_password=False)
    return Settings(database_url=database_url,client_id=client,school_id=school,accounts=accounts,device_ids=ids,device_policy=policy,teacher_user='teacher',teacher_hash=teacher_hash,retention_days=14)

if __name__ == '__main__':
    import uvicorn
    try:
        cfg = production_settings()
    except (ValueError, OSError):
        raise SystemExit('학교 서버 설정 미완료: DNS/OAuth/시험 계정/서버 전용 secret 파일을 확인하세요.')
    uvicorn.run(create_app(cfg), host='0.0.0.0', port=8000, access_log=False, proxy_headers=False)

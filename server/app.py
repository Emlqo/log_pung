"""수집 없는 배포 시험 서버. 인증에서만 검증된 Google 이메일을 사용한다."""
import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, Column, String, DateTime, Text, select, delete
from sqlalchemy.orm import DeclarativeBase, Session

load_dotenv(Path(__file__).with_name('.env'))

@dataclass
class Settings:
    database_url: str = os.getenv('DATABASE_URL', 'sqlite:///./pilot.db')
    client_id: str = os.getenv('GOOGLE_CLIENT_ID', '')
    school_id: str = os.getenv('SCHOOL_ID', '')
    accounts: tuple = tuple(x.strip().lower() for x in os.getenv('TEST_ACCOUNT_EMAILS', '').split(',') if x.strip())
    device_ids: tuple = tuple(x.strip() for x in os.getenv('ALLOWED_DEVICE_IDS', '').split(',') if x.strip())
    device_policy: str = os.getenv('DEVICE_POLICY', 'allowlist')
    teacher_user: str = os.getenv('TEACHER_USER', 'teacher')
    teacher_hash: str = os.getenv('TEACHER_PASSWORD_HASH', '')
    retention_days: int = int(os.getenv('RETENTION_DAYS', '14'))

class Base(DeclarativeBase): pass
class StatusRow(Base):
    __tablename__ = 'pilot_status'
    key = Column(String(64), primary_key=True)
    school = Column(String(64), nullable=False)
    email = Column(String(254), nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=False)
    data = Column(Text, nullable=False)

class Report(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    school_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,64}$')
    device_id: str | None = Field(default=None, min_length=1, max_length=200)
    device_state: Literal['confirmed', 'needs_check']
    install_type: Literal['admin', 'development', 'normal', 'sideload', 'other', 'unknown']
    platform: Literal['cros', 'win', 'mac', 'linux', 'openbsd', 'fuchsia', 'android', 'unknown']
    extension_version: str = Field(pattern=r'^\d{1,5}(\.\d{1,5}){1,3}$')
    trigger: Literal['installed', 'startup', 'alarm', 'worker_restart', 'managed_change', 'account_change']
    interval_minutes: int = Field(ge=5, le=60)
    recent_error: Literal['none', 'previous_attempt_failed'] = 'none'

def unauthorized(): return HTTPException(401, '인증 실패', headers={'WWW-Authenticate': 'Bearer'})

async def verify_google(token: str, settings: Settings) -> str:
    if not settings.client_id or not settings.accounts or not settings.school_id:
        raise HTTPException(503, '서버 인증 설정 필요')
    # 외부 HTTPS 검증 실패 시 fail closed. 토큰·응답 내용 로그 금지.
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            result = await client.get('https://oauth2.googleapis.com/tokeninfo', params={'access_token': token})
            if result.status_code != 200: raise unauthorized()
            info = result.json()
            if info.get('aud') != settings.client_id or int(info.get('expires_in', 0)) <= 0:
                raise unauthorized()
            if 'https://www.googleapis.com/auth/userinfo.email' not in info.get('scope', '').split():
                raise unauthorized()
            result = await client.get('https://openidconnect.googleapis.com/v1/userinfo', headers={'Authorization': 'Bearer ' + token})
            if result.status_code != 200: raise unauthorized()
            user = result.json()
            email = str(user.get('email', '')).lower()
            if user.get('email_verified') is not True or not user.get('sub') or info.get('sub') != user['sub']:
                raise unauthorized()
            if not email.endswith('@goedu.kr') or email not in settings.accounts:
                raise HTTPException(403, '시험 학교 계정 대상 아님')
            return email
    except HTTPException: raise
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        raise HTTPException(503, 'Google 인증 확인 연결 실패')

def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return salt + ':' + digest

def password_matches(password: str, encoded: str) -> bool:
    try:
        salt, digest = encoded.split(':')
        actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, digest)
    except (ValueError, TypeError): return False

def create_app(settings: Settings | None = None, verifier=verify_google):
    cfg = settings or Settings()
    if cfg.device_policy not in ('allowlist', 'diagnostic') or not 1 <= cfg.retention_days <= 90:
        raise ValueError('서버 기기 정책 또는 보관 기간 오류')
    engine = create_engine(cfg.database_url, connect_args={'check_same_thread': False} if cfg.database_url.startswith('sqlite') else {})
    @asynccontextmanager
    async def lifespan(_app):
        Base.metadata.create_all(engine)
        with Session(engine) as session:
            session.execute(delete(StatusRow).where(StatusRow.last_seen < datetime.now(timezone.utc)-timedelta(days=cfg.retention_days)))
            session.commit()
        yield
        engine.dispose()
    app = FastAPI(title='학교 배포 진단 시험', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    bearer = HTTPBearer(auto_error=False)
    basic = HTTPBasic(auto_error=False)
    async def student(credentials=Depends(bearer)):
        if not credentials or credentials.scheme.lower() != 'bearer' or len(credentials.credentials)>4096:
            raise unauthorized()
        return await verifier(credentials.credentials, cfg)
    def teacher(credentials: HTTPBasicCredentials | None=Depends(basic)):
        if not cfg.teacher_hash: raise HTTPException(503, '교사 인증 설정 필요')
        if not credentials or not hmac.compare_digest(credentials.username.encode(), cfg.teacher_user.encode()) or not password_matches(credentials.password, cfg.teacher_hash):
            raise HTTPException(401, '교사 인증 필요', headers={'WWW-Authenticate': 'Basic realm="Teacher pilot", charset="UTF-8"'})
        return credentials.username
    @app.middleware('http')
    async def security_headers(request, call_next):
        # 상태 입력을 작은 JSON으로 제한. reverse proxy에도 본문 크기 제한 필요.
        if request.url.path == '/api/status':
            raw = await request.body()
            if len(raw)>4096: return JSONResponse({'detail':'본문 크기 제한'},status_code=413)
        response = await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response
    @app.get('/health')
    def health(): return {'status':'running', 'mode':'diagnostic-only'}
    @app.get('/api/auth/probe')
    def probe(email=Depends(student)): return {'authenticated':True,'email':email}
    @app.post('/api/status')
    def status(report: Report, email=Depends(student)):
        if report.school_id != cfg.school_id: raise HTTPException(403, '학교 대상 아님')
        confirmed = bool(report.device_id and report.device_id in cfg.device_ids and report.install_type == 'admin' and report.platform == 'cros')
        if cfg.device_policy == 'allowlist' and not confirmed: raise HTTPException(403, '기기 대상 확인 필요')
        data = report.model_dump()
        data['device_state'] = 'confirmed' if confirmed else 'needs_check'
        data['auth_state'] = '서버 인증 완료'
        # 기기 ID는 클라이언트 주장. allowlist도 위변조 불가능한 인증이 아님.
        key = hashlib.sha256((cfg.school_id+'\0'+email+'\0'+(report.device_id or '')).encode()).hexdigest()
        with Session(engine) as session:
            row = session.get(StatusRow,key) or StatusRow(key=key)
            row.school=cfg.school_id;row.email=email;row.last_seen=datetime.now(timezone.utc);row.data=json.dumps(data)
            session.add(row)
            session.execute(delete(StatusRow).where(StatusRow.last_seen<datetime.now(timezone.utc)-timedelta(days=cfg.retention_days)))
            session.commit()
        return {'accepted':True,'device_state':data['device_state']}
    @app.get('/api/teacher/status')
    def rows(_teacher=Depends(teacher)):
        now=datetime.now(timezone.utc)
        with Session(engine) as session:
            rows=session.scalars(select(StatusRow).where(StatusRow.last_seen>=now-timedelta(days=cfg.retention_days)).order_by(StatusRow.last_seen.desc())).all()
            results=[]
            for row in rows:
                seen=row.last_seen.replace(tzinfo=timezone.utc) if row.last_seen.tzinfo is None else row.last_seen
                data=json.loads(row.data)
                results.append({'account':row.email,'last_seen':seen.isoformat(),'delayed':(now-seen).total_seconds()>max(900,data['interval_minutes']*180),**data})
            return results
    @app.get('/', response_class=HTMLResponse)
    def dashboard(_teacher=Depends(teacher)): return Path(__file__).with_name('dashboard.html').read_text(encoding='utf-8')
    @app.get('/dashboard.js')
    def javascript(_teacher=Depends(teacher)):
        from fastapi.responses import Response
        return Response(Path(__file__).with_name('dashboard.js').read_text(encoding='utf-8'),media_type='text/javascript')
    @app.get('/dashboard.css')
    def stylesheet(_teacher=Depends(teacher)):
        from fastapi.responses import Response
        return Response(Path(__file__).with_name('dashboard.css').read_text(encoding='utf-8'),media_type='text/css')
    app.state.engine=engine
    return app

app = create_app()

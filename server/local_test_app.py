"""교사 본인 PC 전용 10분 수집 서버. 학생 Google 인증 서버와 별도 실행한다."""
import hashlib
import hmac
import json
import secrets
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4, UUID
from urllib.parse import urlsplit

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBasic, HTTPBearer
from fastapi.responses import HTMLResponse, Response, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import create_engine, Column, String, BigInteger, Text, delete, select
from sqlalchemy.orm import DeclarativeBase, Session
try:
    from .app import password_matches
except ImportError:
    from app import password_matches

@dataclass
class LocalSettings:
    database_url: str = 'sqlite:///'+str(Path(__file__).resolve().parents[3]/'work'/'local-collection.db')
    teacher_hash: str = ''

class LocalBase(DeclarativeBase):pass
class EventRow(LocalBase):
    __tablename__='teacher_local_events'
    id=Column(String(80),primary_key=True)
    run_id=Column(String(36),nullable=False)
    received_at=Column(BigInteger,nullable=False)
    data=Column(Text,nullable=False)

class Event(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    id:str=Field(max_length=36)
    at:int=Field(gt=0)
    url:str=Field(max_length=2048)
    search:str|None=Field(default=None,max_length=200)
    kind:str=Field(pattern=r'^(visit|spa)$')
    @field_validator('id')
    @classmethod
    def uuid_id(cls,value):
        if str(UUID(value))!=value:raise ValueError('event ID 형식 오류')
        return value
    @field_validator('url')
    @classmethod
    def limited_url(cls,value):
        u=urlsplit(value)
        if u.scheme not in ('http','https') or not u.hostname or u.username or u.password or u.query or u.fragment or any(ord(c)<32 for c in value):raise ValueError('정리된 HTTP(S) 방문 URL만 허용')
        return value
class Batch(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    events:list[Event]=Field(min_length=1,max_length=20)

def create_local_app(cfg:LocalSettings):
    if cfg.database_url.startswith('sqlite:///'):
        Path(cfg.database_url.removeprefix('sqlite:///')).parent.mkdir(parents=True,exist_ok=True)
    engine=create_engine(cfg.database_url,connect_args={'check_same_thread':False} if cfg.database_url.startswith('sqlite') else {})
    sessions={}
    @asynccontextmanager
    async def lifespan(_app):
        LocalBase.metadata.create_all(engine)
        with Session(engine) as db:
            db.execute(delete(EventRow).where(EventRow.received_at<int(time.time()*1000)-86400000));db.commit()
        yield
        sessions.clear();engine.dispose()
    app=FastAPI(title='교사 로컬 수집 시험',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    basic=HTTPBasic(auto_error=False);bearer=HTTPBearer(auto_error=False)
    def teacher(credentials=Depends(basic)):
        if not cfg.teacher_hash:raise HTTPException(503,'실행 도구에서 교사 시험 비밀번호를 먼저 설정하세요.')
        if not credentials or not hmac.compare_digest(credentials.username.encode(),b'teacher') or not password_matches(credentials.password,cfg.teacher_hash):
            raise HTTPException(401,'교사 시험 인증 필요',headers={'WWW-Authenticate':'Basic realm="Local teacher test"'})
        return 'teacher'
    def session(credentials=Depends(bearer)):
        if not credentials:raise HTTPException(401,'시험 세션 인증 필요')
        digest=hashlib.sha256(credentials.credentials.encode()).hexdigest();s=sessions.get(digest)
        if not s or s['expires_at']<=int(time.time()*1000):
            sessions.pop(digest,None);raise HTTPException(401,'시험 세션 만료')
        return s
    @app.middleware('http')
    async def limits(request:Request,call_next):
        # 127.0.0.1 Host만 허용. 공개 호스팅·다른 학생의 원격 접속용 앱 아님.
        if request.url.hostname!='127.0.0.1':return JSONResponse({'detail':'본인 PC loopback 전용'},status_code=403)
        origin=request.headers.get('origin','')
        if origin and not (origin=='http://127.0.0.1:8765' or origin.startswith('chrome-extension://')):
            return JSONResponse({'detail':'허용되지 않은 웹 Origin'},status_code=403)
        if request.url.path=='/api/local/events' and len(await request.body())>65536:return JSONResponse({'detail':'본문 크기 제한'},status_code=413)
        response=await call_next(request)
        response.headers['Cache-Control']='no-store';response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response
    @app.get('/health')
    def health():return {'mode':'teacher-local-only','student_auth_verified':False}
    @app.post('/api/local/login')
    def login(_teacher=Depends(teacher)):
        now=int(time.time()*1000)
        for key in list(sessions):
            if sessions[key]['expires_at']<=now:sessions.pop(key,None)
        if len(sessions)>=20:raise HTTPException(429,'활성 시험 세션 한도')
        token=secrets.token_urlsafe(32);s={'run_id':str(uuid4()),'started_at':now,'expires_at':now+600000}
        sessions[hashlib.sha256(token.encode()).hexdigest()]=s
        return {'token':token,**s}
    @app.get('/api/local/probe')
    def probe(s=Depends(session)):return {'run_id':s['run_id'],'expires_at':s['expires_at']}
    @app.post('/api/local/events')
    def events(batch:Batch,s=Depends(session)):
        now=int(time.time()*1000)
        if any(e.at<s['started_at']-5000 or e.at>s['expires_at'] or e.at>now+5000 for e in batch.events):raise HTTPException(422,'시험 시간 밖의 이벤트')
        with Session(engine) as db:
            db.execute(delete(EventRow).where(EventRow.received_at<now-86400000))
            existing=list(db.scalars(select(EventRow).where(EventRow.run_id==s['run_id'])))
            known={row.id:row for row in existing}
            for event in batch.events:
                key=s['run_id']+':'+event.id;data=json.dumps(event.model_dump(),ensure_ascii=False)
                if key in known:
                    if known[key].data!=data:raise HTTPException(409,'같은 이벤트 ID의 내용 변경 금지')
                    continue
                if len(known)>=200:raise HTTPException(409,'시험 200건 한도')
                row=EventRow(id=key,run_id=s['run_id'],received_at=now,data=data);db.add(row);known[key]=row
            db.commit()
        return {'accepted_ids':[e.id for e in batch.events],'run_id':s['run_id']}
    @app.get('/api/local/view')
    def view(_teacher=Depends(teacher)):
        with Session(engine) as db:
            return [{'run_id':row.run_id,'received_at':row.received_at,**json.loads(row.data)} for row in db.scalars(select(EventRow).where(EventRow.received_at>=int(time.time()*1000)-86400000).order_by(EventRow.received_at.desc()).limit(1000))]
    @app.delete('/api/local/records')
    def clear(_teacher=Depends(teacher)):
        with Session(engine) as db:db.execute(delete(EventRow));db.commit()
        sessions.clear();return {'deleted':True}
    @app.get('/',response_class=HTMLResponse)
    def page(_teacher=Depends(teacher)):return Path(__file__).with_name('local-test-dashboard.html').read_text(encoding='utf-8')
    @app.get('/local-test-dashboard.js')
    def js(_teacher=Depends(teacher)):return Response(Path(__file__).with_name('local-test-dashboard.js').read_text(encoding='utf-8'),media_type='text/javascript')
    @app.get('/local-test-dashboard.css')
    def css(_teacher=Depends(teacher)):return Response(Path(__file__).with_name('dashboard.css').read_text(encoding='utf-8'),media_type='text/css')
    app.state.engine=engine;app.state.sessions=sessions
    return app

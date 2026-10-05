"""Small school pilot: self-reported email, NO student OAuth; teacher login required."""
import hashlib
import hmac
import json
import os
import re
import time
from threading import Lock
from pathlib import Path
from uuid import uuid4
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBasic
from fastapi.responses import HTMLResponse, Response, JSONResponse, FileResponse
from pydantic import ConfigDict, Field, field_validator
from sqlalchemy import create_engine, Column, String, BigInteger, Integer, Text, select, delete, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import NullPool
try:
    from .app import Report, password_matches
    from .local_test_app import Event
    from .student_directory import parse_directory, MAX_DIRECTORY_BYTES
except ImportError:
    from app import Report, password_matches
    from local_test_app import Event
    from student_directory import parse_directory, MAX_DIRECTORY_BYTES

LABEL = '인증되지 않은 계정 정보'

@dataclass
class StudentSettings:
    database_url: str = field(default_factory=lambda: os.getenv('DATABASE_URL',''))
    school_id: str = field(default_factory=lambda: os.getenv('SCHOOL_ID','school-pilot'))
    device_policy: str = field(default_factory=lambda: os.getenv('DEVICE_POLICY','policy'))
    device_ids: tuple = field(default_factory=lambda: tuple(x.strip() for x in os.getenv('ALLOWED_DEVICE_IDS','').split(',') if x.strip()))
    teacher_hash: str = field(default_factory=lambda: os.getenv('TEACHER_PASSWORD_HASH',''))
    enabled: bool = field(default_factory=lambda: os.getenv('STUDENT_TEST_ENABLED','false')=='true')

class StudentBase(DeclarativeBase): pass
class StudentDirectory(StudentBase):
    __tablename__='student_directory'
    school=Column(String(64),primary_key=True)
    email=Column(String(254),primary_key=True)
    display_name=Column(String(200),nullable=False)

class StudentStatus(StudentBase):
    __tablename__='student_email_test_status'
    email=Column(String(254),primary_key=True)
    received=Column(BigInteger,nullable=False)
    data=Column(Text,nullable=False)
class TestWindow(StudentBase):
    __tablename__='student_email_test_window'
    school=Column(String(64),primary_key=True)
    window_id=Column(String(36),nullable=False)
    starts=Column(BigInteger,nullable=False)
    ends=Column(BigInteger,nullable=False)
class WindowBudget(StudentBase):
    __tablename__='student_email_test_budget'
    key=Column(String(64),primary_key=True)
    count=Column(Integer,nullable=False,default=0)
class StudentEvent(StudentBase):
    __tablename__='student_email_test_events'
    key=Column(String(64),primary_key=True)
    email=Column(String(254),nullable=False)
    window_id=Column(String(36),nullable=False)
    received=Column(BigInteger,nullable=False)
    data=Column(Text,nullable=False)

class EmailReport(Report):
    email: str = Field(max_length=254)
    @field_validator('email')
    @classmethod
    def school_email(cls,value):
        if not re.fullmatch(r'[^@\s]+@goedu\.kr',value.lower()): raise ValueError('학교 이메일 필요')
        return value.lower()
class EventReport(EmailReport):
    window_id: str = Field(min_length=36,max_length=36)
    events: list[Event] = Field(min_length=1,max_length=20)

def now(): return int(time.time()*1000)
def window_active(w):return bool(w and w.starts is not None and w.ends is not None and w.starts<=now() and (w.ends==0 or now()<w.ends))

def create_student_app(cfg=None):
    cfg=cfg or StudentSettings()
    if cfg.database_url.startswith(('postgres://','postgresql://')):
        cfg.database_url='postgresql+psycopg://'+cfg.database_url.split('://',1)[1]
    if cfg.database_url and os.getenv('VERCEL') and not cfg.database_url.startswith('postgresql+psycopg://'):
        raise ValueError('Vercel에는 외부 PostgreSQL DATABASE_URL이 필요합니다.')
    engine=create_engine(cfg.database_url, poolclass=NullPool, connect_args={'check_same_thread':False} if cfg.database_url.startswith('sqlite') else {}) if cfg.database_url else None
    initialized=False
    initialization_lock=Lock()
    def initialize_database():
        # Some serverless adapters do not send ASGI lifespan events.
        nonlocal initialized
        if initialized or not engine:return
        with initialization_lock:
            if initialized:return
            with engine.begin() as connection:
                if engine.dialect.name=='postgresql':
                    # Serialize initial DDL across concurrently starting instances.
                    connection.execute(text('SELECT pg_advisory_xact_lock(724019062)'))
                StudentBase.metadata.create_all(connection)
                connection.execute(delete(StudentEvent).where(StudentEvent.received<now()-86400000))
                connection.execute(delete(StudentStatus).where(StudentStatus.received<now()-86400000))
            initialized=True
    @asynccontextmanager
    async def lifespan(_app):
        initialize_database()
        yield
        if engine:engine.dispose()
    app=FastAPI(title='학교 이메일 수집 시험',lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    basic=HTTPBasic(auto_error=False)
    def teacher(credentials=Depends(basic)):
        if not cfg.teacher_hash:raise HTTPException(503,'교사 비밀번호 설정 필요')
        if not credentials or not hmac.compare_digest(credentials.username.encode(),b'teacher') or not password_matches(credentials.password,cfg.teacher_hash):
            raise HTTPException(401,'교사 로그인 필요',headers={'WWW-Authenticate':'Basic realm="School pilot"'})
        return 'teacher'
    def ready():
        if not engine or not cfg.enabled or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',cfg.school_id) or cfg.device_policy not in ('policy','allowlist'):
            raise HTTPException(503,'서버 DB·학교 식별값·시험 활성화 설정 필요')
        try:initialize_database()
        except SQLAlchemyError:raise HTTPException(503,'데이터베이스 연결·초기화 확인 필요') from None
    def target(report):
        ready()
        if report.school_id!=cfg.school_id:raise HTTPException(403,'시험 학교 아님')
    def device(report):
        if cfg.device_policy=='policy':return report.install_type=='admin'
        return bool(report.device_id and report.device_id in cfg.device_ids and report.install_type=='admin' and report.platform=='cros')
    @app.middleware('http')
    async def limits(request:Request,call_next):
        if request.url.path.startswith('/api/'):
            maximum=MAX_DIRECTORY_BYTES if request.url.path=='/api/teacher/directory' else 65536
            chunks=[];size=0
            async for chunk in request.stream():
                size+=len(chunk)
                if size>maximum:return JSONResponse({'detail':'본문 크기 제한'},status_code=413)
                chunks.append(chunk)
            request._body=b''.join(chunks)
        if request.method=='POST' and request.url.path.startswith('/api/teacher/'):
            origin=request.headers.get('origin')
            if origin and origin!=str(request.base_url).rstrip('/'):
                return JSONResponse({'detail':'다른 사이트에서의 교사 조작 거부'},status_code=403)
        response=await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response
    @app.get('/health')
    def health():return {'status':'running','mode':'unverified-email-pilot','student_authenticated':False,'configured':bool(engine and cfg.enabled and re.fullmatch(r'[A-Za-z0-9_-]{1,64}',cfg.school_id))}
    @app.get('/distribution/{filename}')
    def distribution(filename:str):
        # Public signed packages only. Never expose directories, keys or teacher data.
        if filename!='updates.xml' and not re.fullmatch(r'student-email-test-\d+(?:\.\d+){1,3}\.crx',filename):
            raise HTTPException(404,'배포 파일 없음')
        path=Path(__file__).with_name('distribution')/filename
        if not path.is_file():raise HTTPException(404,'배포 파일 없음')
        return FileResponse(path,media_type='application/xml' if filename=='updates.xml' else 'application/x-chrome-extension')
    @app.get('/api/student/window')
    def window():
        ready()
        with Session(engine) as db:
            w=db.get(TestWindow,cfg.school_id)
            if not window_active(w):return {'active':False,'student_authenticated':False}
            return {'active':True,'window_id':w.window_id,'starts_at':w.starts,'ends_at':w.ends or None,'mode':'on-off' if w.ends==0 else 'timed','student_authenticated':False}
    @app.post('/api/student/status')
    def status(report:EmailReport):
        target(report)
        data=report.model_dump();data['device_state']='confirmed' if device(report) else 'needs_check';data['auth_state']=LABEL;data['device_policy']=cfg.device_policy
        with Session(engine) as db:
            row=db.get(StudentStatus,report.email) or StudentStatus(email=report.email)
            row.received=now();row.data=json.dumps(data);db.add(row);db.commit()
        return {'accepted':True,'student_authenticated':False,'device_state':data['device_state']}
    @app.post('/api/student/events')
    def events(report:EventReport):
        target(report)
        if not device(report):raise HTTPException(403,'정책 설치·ChromeOS·학교 기기 대상 확인 필요')
        with Session(engine) as db:
            # Lock the durable control state against concurrent OFF and uploads.
            w=db.scalar(select(TestWindow).where(TestWindow.school==cfg.school_id).with_for_update())
            if not window_active(w) or w.window_id!=report.window_id:raise HTTPException(403,'수집 시험 시간 아님')
            if any(e.at<w.starts or (w.ends!=0 and e.at>=w.ends) or e.at>now()+5000 for e in report.events):raise HTTPException(422,'시험 시간 밖 이벤트')
            budget_key=hashlib.sha256((report.email+w.window_id).encode()).hexdigest()
            budget=db.get(WindowBudget,budget_key) or WindowBudget(key=budget_key,count=0)
            accepted=[]
            for event in report.events:
                key=hashlib.sha256((report.email+w.window_id+event.id).encode()).hexdigest()
                row=db.get(StudentEvent,key);data=json.dumps(event.model_dump(),ensure_ascii=False,sort_keys=True)
                if row:
                    if row.data!=data:raise HTTPException(409,'같은 이벤트 ID의 내용 변경 거부')
                else:
                    db.add(StudentEvent(key=key,email=report.email,window_id=w.window_id,received=now(),data=data));budget.count+=1;db.flush()
                accepted.append(event.id)
            db.add(budget)
            db.execute(delete(StudentEvent).where(StudentEvent.received<now()-86400000));db.commit()
        return {'accepted_ids':accepted,'student_authenticated':False}
    @app.post('/api/teacher/window/start')
    def start(_teacher=Depends(teacher)):
        ready()
        if cfg.device_policy=='allowlist' and not cfg.device_ids:raise HTTPException(409,'실제 학교 기기 ID 목록부터 설정하세요.')
        with Session(engine) as db:
            w=db.get(TestWindow,cfg.school_id) or TestWindow(school=cfg.school_id)
            if window_active(w) and w.ends==0:return {'window_id':w.window_id,'starts_at':w.starts,'ends_at':w.ends or None}
            w.window_id=str(uuid4());w.starts=now();w.ends=0
            db.add(w);db.commit()
            return {'window_id':w.window_id,'starts_at':w.starts,'ends_at':None}
    @app.post('/api/teacher/window/stop')
    def stop(_teacher=Depends(teacher)):
        ready()
        with Session(engine) as db:
            w=db.get(TestWindow,cfg.school_id)
            if w:w.ends=now();db.commit()
        return {'stopped':True}
    @app.post('/api/teacher/directory')
    async def directory(request:Request,_teacher=Depends(teacher)):
        ready()
        try:names=parse_directory(await request.body())
        except ValueError as error:raise HTTPException(422,str(error)) from None
        if engine.dialect.name=='postgresql':
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        rows=[{'school':cfg.school_id,'email':email,'display_name':name} for email,name in names.items()]
        try:
            with Session(engine) as db:
                for offset in range(0,len(rows),200):
                    statement=insert(StudentDirectory).values(rows[offset:offset+200])
                    db.execute(statement.on_conflict_do_update(index_elements=['school','email'],set_={'display_name':statement.excluded.display_name}))
                db.commit()
        except SQLAlchemyError:raise HTTPException(503,'명단 저장 실패 · 잠시 후 다시 시도해주세요.') from None
        return {'matched_directory_entries':len(names)}
    @app.get('/api/teacher/view')
    def view(_teacher=Depends(teacher)):
        ready()
        with Session(engine) as db:
            statuses=[{'email':s.email,'received_at':s.received,'delayed':now()-s.received>900000,**json.loads(s.data)} for s in db.scalars(select(StudentStatus).where(StudentStatus.received>=now()-86400000).order_by(StudentStatus.received.desc()))]
            records=[{'email':e.email,'received_at':e.received,**json.loads(e.data),'auth_state':LABEL} for e in db.scalars(select(StudentEvent).where(StudentEvent.received>=now()-86400000).order_by(StudentEvent.received.desc()).limit(600))]
            # Only return names for observed rows, never the entire directory.
            observed=list({row['email'] for row in statuses+records})
            names={}
            for offset in range(0,len(observed),400):
                names.update({entry.email:entry.display_name for entry in db.scalars(select(StudentDirectory).where(StudentDirectory.school==cfg.school_id,StudentDirectory.email.in_(observed[offset:offset+400])))})
            for row in statuses+records:row['display_name']=names.get(row['email'],'')
            w=db.get(TestWindow,cfg.school_id)
            return {'statuses':statuses,'events':records,'active':window_active(w),'ends_at':(w.ends or None) if w else None,'student_authenticated':False}
    @app.get('/',response_class=HTMLResponse)
    def dashboard(_teacher=Depends(teacher)):return Path(__file__).with_name('student-dashboard.html').read_text(encoding='utf-8')
    @app.get('/student-dashboard.js')
    def script(_teacher=Depends(teacher)):return Response(Path(__file__).with_name('student-dashboard.js').read_text(encoding='utf-8'),media_type='text/javascript')
    @app.get('/student-dashboard-filters.js')
    def filter_script(_teacher=Depends(teacher)):return Response(Path(__file__).with_name('student-dashboard-filters.js').read_text(encoding='utf-8'),media_type='text/javascript')
    @app.get('/dashboard.css')
    def style(_teacher=Depends(teacher)):return Response(Path(__file__).with_name('dashboard.css').read_text(encoding='utf-8'),media_type='text/css')
    app.state.engine=engine
    return app

app=create_student_app()


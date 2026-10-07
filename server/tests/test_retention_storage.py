import json
from datetime import datetime
from uuid import uuid4
from sqlalchemy import select, delete, text
from sqlalchemy.orm import Session
import student_test_app as module
from student_test_app import StudentEvent, CleanupState, KnownStudent, KST, RETENTION_MS
from test_student_app import AUTH, BASE, config, client

def seed(client,ages):
    stamp=module.now()
    with Session(client.app.state.engine) as db:
        for age in ages:
            at=stamp-age
            db.add(StudentEvent(key=str(uuid4()),email=BASE['email'],window_id='fixture',received=stamp,
                data=json.dumps(dict(id=str(uuid4()),at=at,url='https://example.test/path/'+str(uuid4()),search='검증',kind='visit'))))
        db.commit()

def test_seven_day_retention_uses_activity_time_and_keeps_directory(client,monkeypatch):
    stamp=module.now();monkeypatch.setattr(module,'now',lambda:stamp)
    client.post('/api/student/status',json=BASE)
    seed(client,[86400000*2,RETENTION_MS,RETENTION_MS+1])
    with Session(client.app.state.engine) as db:db.execute(delete(CleanupState));db.commit()
    response=client.get('/api/teacher/view?period=7d',auth=AUTH)
    assert response.status_code==200 and response.json()['total']==2
    with Session(client.app.state.engine) as db:
        assert len(list(db.scalars(select(StudentEvent))))==2
        assert db.get(KnownStudent,('school-pilot',BASE['email'])) is not None

def test_expired_hidden_even_before_next_cleanup(client,monkeypatch):
    stamp=module.now();monkeypatch.setattr(module,'now',lambda:stamp)
    seed(client,[RETENTION_MS+1,0])
    assert client.get('/api/teacher/view?period=7d',auth=AUTH).json()['total']==1

def test_korean_calendar_range_and_filter_before_pagination(client,monkeypatch):
    stamp=int(datetime(2026,10,6,12,tzinfo=KST).timestamp()*1000);monkeypatch.setattr(module,'now',lambda:stamp)
    seed(client,[i for i in range(705)]+[86400000*2])
    first=client.get('/api/teacher/view?period=7d',auth=AUTH).json()
    second=client.get('/api/teacher/view?period=7d&page=2',auth=AUTH).json()
    third=client.get('/api/teacher/view?period=7d&page=8',auth=AUTH).json()
    assert first['total']==706 and len(first['events'])==100 and len(third['events'])==6
    assert not {e['id'] for e in first['events']} & {e['id'] for e in second['events']}
    dated=client.get('/api/teacher/view?period=custom&start=2026-10-04&end=2026-10-04',auth=AUTH).json()
    assert dated['total']==1
    assert client.get('/api/teacher/view?period=7d&query=검증&site=example.test&kind=search',auth=AUTH).json()['total']==706
    assert client.get('/api/teacher/view?period=7d&email=missing@goedu.kr',auth=AUTH).json()['total']==0
    assert client.get('/api/teacher/view?period=custom&start=2026-10-07&end=2026-10-01',auth=AUTH).status_code==422
    assert client.get('/api/teacher/view?page=0',auth=AUTH).status_code==422
    assert client.get('/api/teacher/view?period=7d&query=%25',auth=AUTH).json()['total']==0

def test_storage_protected_real_size_and_empty_records(client):
    assert client.get('/api/teacher/storage').status_code==401
    result=client.get('/api/teacher/storage',auth=AUTH).json()
    assert result['used_bytes']>0 and result['event_count']==0 and result['oldest_at'] is None
    assert result['account_plan_verified'] is False and result['reference_limit_bytes'] is None
    seed(client,[1000])
    assert client.get('/api/teacher/storage',auth=AUTH).json()['event_count']==1

def test_scheduled_cleanup_requires_secret_and_runs_without_student_connection(client,monkeypatch):
    monkeypatch.delenv('CRON_SECRET',raising=False)
    assert client.get('/api/maintenance/retention').status_code==503
    monkeypatch.setenv('CRON_SECRET','test-cron-secret')
    assert client.get('/api/maintenance/retention').status_code==401
    assert client.get('/api/maintenance/retention',headers={'Authorization':'Bearer wrong'}).status_code==401
    seed(client,[RETENTION_MS+1])
    with Session(client.app.state.engine) as db:db.execute(delete(CleanupState));db.commit()
    assert client.get('/api/maintenance/retention',headers={'Authorization':'Bearer test-cron-secret'}).status_code==204
    with Session(client.app.state.engine) as db:assert not list(db.scalars(select(StudentEvent)))

def test_date_boundaries_are_korean_midnight(client,monkeypatch):
    stamp=int(datetime(2026,10,6,12,tzinfo=KST).timestamp()*1000);monkeypatch.setattr(module,'now',lambda:stamp)
    midnight=int(datetime(2026,10,5,0,tzinfo=KST).timestamp()*1000)
    seed(client,[stamp-midnight+1,stamp-midnight,stamp-midnight-86400000+1,stamp-midnight-86400000])
    assert client.get('/api/teacher/view?period=custom&start=2026-10-05&end=2026-10-05',auth=AUTH).json()['total']==2

def test_late_expired_upload_rejected(client):
    from test_student_app import begin, upload, event
    from student_test_app import TestWindow
    window=begin(client)
    with Session(client.app.state.engine) as db:
        db.get(TestWindow,'school-pilot').starts=module.now()-10*86400000;db.commit()
    assert upload(client,window,[{**event(),'at':module.now()-8*86400000}]).status_code==422

def test_query_uses_time_index(client):
    from student_test_app import EVENT_TIME
    statement=select(StudentEvent.key).where(EVENT_TIME>=0).order_by(EVENT_TIME)
    sql=str(statement.compile(client.app.state.engine,compile_kwargs={'literal_binds':True}))
    with Session(client.app.state.engine) as db:
        plan=str(db.execute(text('EXPLAIN QUERY PLAN '+sql)).all())
        assert 'ix_activity_time' in plan

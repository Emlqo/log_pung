import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app import password_hash
from student_test_app import create_student_app,StudentSettings

AUTH=('teacher','only-teacher-test-password')
BASE=dict(email='pilot-a@goedu.kr',school_id='school-pilot',device_id='directory-test',device_state='confirmed',install_type='admin',platform='cros',extension_version='0.2.0',trigger='alarm',interval_minutes=5)
@pytest.fixture
def config(tmp_path):return StudentSettings(database_url='sqlite:///'+str(tmp_path/'student.db'),accounts=('pilot-a@goedu.kr','pilot-b@goedu.kr'),device_ids=('directory-test',),teacher_hash=password_hash(AUTH[1]),enabled=True)
@pytest.fixture
def client(config):
    with TestClient(create_student_app(config)) as c:yield c
def begin(client):
    r=client.post('/api/teacher/window/start',auth=AUTH);assert r.status_code==200;return r.json()['window_id']
def event():return dict(id=str(uuid4()),at=int(time.time()*1000),url='https://www.google.com/search',search='시험',kind='visit')
def upload(client,window,events,**changes):return client.post('/api/student/events',json={**BASE,'window_id':window,'events':events,**changes})
def test_no_student_oauth_but_unverified_email_label_and_teacher_required(client):
    assert client.get('/').status_code==401
    assert client.get('/student-dashboard.js').status_code==401
    assert client.get('/api/teacher/view').status_code==401
    assert client.post('/api/teacher/window/start').status_code==401
    response=client.post('/api/student/status',json=BASE)
    assert response.status_code==200 and response.json()['student_authenticated'] is False
    row=client.get('/api/teacher/view',auth=AUTH).json()['statuses'][0]
    assert row['email']==BASE['email'] and row['auth_state']=='인증되지 않은 계정 정보'
def test_defaults_fail_closed():
    with TestClient(create_student_app(StudentSettings())) as c:
        assert c.get('/health').json()['student_authenticated'] is False
        assert c.post('/api/student/status',json=BASE).status_code==503
@pytest.mark.parametrize('field',['token','page_content','cookies','password'])
def test_only_explicit_trial_fields(client,field):
    assert client.post('/api/student/status',json={**BASE,field:'rejected'}).status_code==422
@pytest.mark.parametrize('change',[dict(email='outside@goedu.kr'),dict(school_id='other')])
def test_non_trial_accounts_school_rejected(client,change):
    assert client.post('/api/student/status',json={**BASE,**change}).status_code==403
def test_collection_only_during_teacher_window_device_checks_and_stop(client):
    assert upload(client,str(uuid4()),[event()]).status_code==403
    w=begin(client)
    assert client.post('/api/teacher/window/start',auth=AUTH).status_code==409
    for change in [dict(device_id=None),dict(install_type='development'),dict(platform='win')]:
        assert upload(client,w,[event()],**change).status_code==403
    e=event();assert upload(client,w,[e]).status_code==200
    assert upload(client,w,[e]).status_code==200
    assert len(client.get('/api/teacher/view',auth=AUTH).json()['events'])==1
    assert upload(client,w,[{**e,'search':'changed'}]).status_code==409
    client.post('/api/teacher/window/stop',auth=AUTH)
    assert upload(client,w,[event()]).status_code==403
def test_url_and_body_constraints(client):
    w=begin(client)
    assert upload(client,w,[{**event(),'url':'https://site.test/?token=secret'}]).status_code==422
    assert upload(client,w,[{**event(),'at':1}]).status_code==422
    assert client.post('/api/student/status',content='x'*65537).status_code==413
    assert client.post('/api/teacher/window/start',auth=AUTH,headers={'Origin':'https://other.test'}).status_code==403
def test_quota_survives_new_vercel_instance(config):
    with TestClient(create_student_app(config)) as c:
        w=begin(c)
        for _ in range(10):assert upload(c,w,[event() for _ in range(20)]).status_code==200
    with TestClient(create_student_app(config)) as c:
        assert c.get('/api/student/window').json()['active'] is True
        assert upload(c,w,[event()]).status_code==429
def test_missing_device_ids_and_large_account_list_wait(config):
    config.device_ids=()
    with TestClient(create_student_app(config)) as c:assert c.post('/api/teacher/window/start',auth=AUTH).status_code==409
    config.accounts=('a@goedu.kr','b@goedu.kr','c@goedu.kr','d@goedu.kr')
    with TestClient(create_student_app(config)) as c:assert c.post('/api/student/status',json=BASE).status_code==503
def test_vercel_rejects_sqlite(config,monkeypatch):
    monkeypatch.setenv('VERCEL','1')
    with pytest.raises(ValueError):create_student_app(config)

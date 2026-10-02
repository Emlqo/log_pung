import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app import password_hash
from local_test_app import LocalSettings,create_local_app
AUTH=('teacher','teacher-test-password')
@pytest.fixture
def client(tmp_path):
    with TestClient(create_local_app(LocalSettings(database_url='sqlite:///'+str(tmp_path/'local.db'),teacher_hash=password_hash(AUTH[1]))),base_url='http://127.0.0.1:8765') as c:yield c
def login(c):
    r=c.post('/api/local/login',auth=AUTH);assert r.status_code==200;return r.json()
def data():return {'events':[{'id':str(uuid4()),'at':int(time.time()*1000),'url':'https://www.google.com/search','search':'chromebook test','kind':'visit'}]}
def head(s):return {'Authorization':'Bearer '+s['token']}
def test_teacher_auth_required_and_no_student_identity(client):
    assert client.get('/').status_code==401;assert client.get('/api/local/view').status_code==401
    assert client.post('/api/local/login').status_code==401
    assert client.post('/api/local/login',auth=('teacher','wrong')).status_code==401
    assert client.post('/api/local/events',json=data()).status_code==401
    assert client.get('/health').json()['student_auth_verified'] is False
def test_roundtrip_duplicate_retry_and_delete(client):
    s=login(client);body=data();r=client.post('/api/local/events',json=body,headers=head(s));assert r.status_code==200
    assert client.post('/api/local/events',json=body,headers=head(s)).status_code==200
    rows=client.get('/api/local/view',auth=AUTH).json();assert len(rows)==1;assert rows[0]['search']=='chromebook test';assert rows[0]['run_id']==s['run_id'];assert 'email' not in rows[0]
    assert client.delete('/api/local/records',auth=AUTH).status_code==200
    assert client.get('/api/local/view',auth=AUTH).json()==[]
    assert client.get('/api/local/probe',headers=head(s)).status_code==401
def test_session_expiry(client):
    s=login(client)
    for session in client.app.state.sessions.values():session['expires_at']=0
    assert client.post('/api/local/events',json=data(),headers=head(s)).status_code==401
@pytest.mark.parametrize('field',['email','device_id','page_content','cookies','password'])
def test_extra_fields_rejected(client,field):
    s=login(client);body=data();body['events'][0][field]='not accepted'
    assert client.post('/api/local/events',json=body,headers=head(s)).status_code==422
    assert client.get('/api/local/view',auth=AUTH).json()==[]
@pytest.mark.parametrize('url',['https://example.org/?token=private','https://user:pass@example.org/','chrome://settings','file:///private','https://example.org/#private'])
def test_unfiltered_url_rejected(client,url):
    s=login(client);body=data();body['events'][0]['url']=url
    assert client.post('/api/local/events',json=body,headers=head(s)).status_code==422
def test_session_time_bound_and_event_conflict(client):
    s=login(client);body=data();body['events'][0]['at']=s['started_at']-10000
    assert client.post('/api/local/events',json=body,headers=head(s)).status_code==422
    body=data();assert client.post('/api/local/events',json=body,headers=head(s)).status_code==200
    body['events'][0]['search']='changed';assert client.post('/api/local/events',json=body,headers=head(s)).status_code==409
def test_remote_host_and_web_origin_rejected(client):
    assert client.get('/health',headers={'Host':'public.example'}).status_code==403
    assert client.post('/api/local/login',auth=AUTH,headers={'Origin':'https://other.example'}).status_code==403
def test_run_cap_200_and_bad_token(client):
    s=login(client)
    assert client.post('/api/local/events',json=data(),headers={'Authorization':'Bearer forged-token'}).status_code==401
    for _ in range(10):
        batch={'events':[data()['events'][0] for _ in range(20)]}
        assert client.post('/api/local/events',json=batch,headers=head(s)).status_code==200
    assert client.post('/api/local/events',json=data(),headers=head(s)).status_code==409
    assert len(client.get('/api/local/view',auth=AUTH).json())==200

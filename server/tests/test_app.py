import base64
import pytest
import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import Settings, create_app, password_hash, verify_google

EMAIL='student@goedu.kr'
DATA=dict(school_id='school-pilot',device_id='directory-1',device_state='confirmed',install_type='admin',platform='cros',extension_version='0.1.0',trigger='startup',interval_minutes=5)
async def fake_verify(token,cfg):
    if token!='verified-token': raise HTTPException(401,'invalid')
    return EMAIL
@pytest.fixture
def client(tmp_path):
    cfg=Settings(database_url='sqlite:///'+str(tmp_path/'test.db'),client_id='client',school_id='school-pilot',accounts=(EMAIL,),device_ids=('directory-1',),teacher_hash=password_hash('teacher-test-password'))
    with TestClient(create_app(cfg,fake_verify)) as client: yield client
HEAD={'Authorization':'Bearer verified-token'}
def teacher(client): return client.get('/api/teacher/status',auth=('teacher','teacher-test-password'))
def test_authentication_and_teacher_protection(client):
    assert client.post('/api/status',json=DATA).status_code==401
    assert client.post('/api/status',json=DATA,headers={'Authorization':'Bearer forged'}).status_code==401
    assert client.get('/').status_code==401
    assert client.get('/api/teacher/status').status_code==401
    assert client.get('/dashboard.js').status_code==401
    assert client.get('/',auth=('teacher','wrong')).status_code==401
    assert teacher(client).json()==[]
    assert client.get('/',auth=('teacher','teacher-test-password')).status_code==200
def test_allowlist_server_recheck_and_upsert(client):
    assert client.get('/api/auth/probe',headers=HEAD).json()['email']==EMAIL
    for change in [dict(device_id=None),dict(device_id='forged-device'),dict(platform='win'),dict(school_id='other')]:
        assert client.post('/api/status',json={**DATA,**change},headers=HEAD).status_code==403
    for _ in range(2): assert client.post('/api/status',json=DATA,headers=HEAD).status_code==200
    rows=teacher(client).json();assert len(rows)==1;assert rows[0]['account']==EMAIL;assert rows[0]['delayed'] is False
@pytest.mark.parametrize('field',['email','url','urls','search','search_term','page_content','history'])
def test_reject_unwanted_fields(client,field):
    assert client.post('/api/status',json={**DATA,field:'not accepted'},headers=HEAD).status_code==422
    assert teacher(client).json()==[]
def test_body_limit(client):
    assert client.post('/api/status',content='x'*5000,headers=HEAD).status_code==413
def test_diagnostic_never_confirms_missing_device(tmp_path):
    cfg=Settings(database_url='sqlite:///'+str(tmp_path/'diag.db'),school_id='school-pilot',device_policy='diagnostic')
    with TestClient(create_app(cfg,fake_verify)) as c:
        r=c.post('/api/status',json={**DATA,'device_id':None},headers=HEAD)
        assert r.status_code==200;assert r.json()['device_state']=='needs_check'

@pytest.mark.parametrize('change',[{'aud':'wrong'},{'expires_in':0},{'scope':''},{'sub':'other'}])
def test_real_verifier_rejects_bad_google_token(monkeypatch,change):
    import asyncio
    tokeninfo={'aud':'client','expires_in':3600,'scope':'https://www.googleapis.com/auth/userinfo.email','sub':'sub1',**change}
    user={'sub':'sub1','email':EMAIL,'email_verified':True}
    install_google_mock(monkeypatch,tokeninfo,user)
    with pytest.raises(HTTPException) as e: asyncio.run(verify_google('token',Settings(client_id='client',accounts=(EMAIL,),school_id='school-pilot')))
    assert e.value.status_code==401
def install_google_mock(monkeypatch,info,user,status=200):
    original=httpx.AsyncClient
    def handler(request):return httpx.Response(status,json=info if request.url.path.endswith('tokeninfo') else user)
    monkeypatch.setattr('app.httpx.AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
def test_real_verifier_verified_school_account(monkeypatch):
    import asyncio
    install_google_mock(monkeypatch,{'aud':'client','expires_in':300,'scope':'https://www.googleapis.com/auth/userinfo.email','sub':'s'},{'sub':'s','email':EMAIL,'email_verified':True})
    assert asyncio.run(verify_google('token',Settings(client_id='client',accounts=(EMAIL,),school_id='school-pilot')))==EMAIL
@pytest.mark.parametrize('email,verified,status',[('a@gmail.com',True,403),(EMAIL,False,401),('outside@goedu.kr',True,403)])
def test_google_wrong_domain_unverified_outside_pilot(monkeypatch,email,verified,status):
    import asyncio
    install_google_mock(monkeypatch,{'aud':'client','expires_in':300,'scope':'https://www.googleapis.com/auth/userinfo.email','sub':'s'},{'sub':'s','email':email,'email_verified':verified})
    with pytest.raises(HTTPException) as e:asyncio.run(verify_google('token',Settings(client_id='client',accounts=(EMAIL,),school_id='school-pilot')))
    assert e.value.status_code==status
def test_google_failure_closed(monkeypatch):
    import asyncio
    install_google_mock(monkeypatch,{}, {},status=500)
    with pytest.raises(HTTPException):asyncio.run(verify_google('token',Settings(client_id='client',accounts=(EMAIL,),school_id='school-pilot')))
def test_config_missing_does_not_bypass():
    import asyncio
    with pytest.raises(HTTPException) as e:asyncio.run(verify_google('token',Settings(client_id='',accounts=())))
    assert e.value.status_code==503
def test_google_network_failure_is_unavailable(monkeypatch):
    import asyncio
    original=httpx.AsyncClient
    def handler(request):raise httpx.ConnectError('offline',request=request)
    monkeypatch.setattr('app.httpx.AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
    with pytest.raises(HTTPException) as e:asyncio.run(verify_google('token',Settings(client_id='client',accounts=(EMAIL,),school_id='school-pilot')))
    assert e.value.status_code==503
def test_delay_is_connection_age_not_usage(client):
    from datetime import datetime, timezone, timedelta
    from sqlalchemy.orm import Session
    from app import StatusRow
    client.post('/api/status',json=DATA,headers=HEAD)
    with Session(client.app.state.engine) as session:
        row=session.query(StatusRow).first();row.last_seen=datetime.now(timezone.utc)-timedelta(minutes=20);session.commit()
    rows=teacher(client).json();assert rows[0]['delayed'] is True
    assert 'student_unused' not in rows[0]

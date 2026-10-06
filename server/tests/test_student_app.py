import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from app import password_hash
from student_test_app import create_student_app,StudentSettings

AUTH=('teacher','only-teacher-test-password')
BASE=dict(email='pilot-a@goedu.kr',school_id='school-pilot',device_id='directory-test',device_state='confirmed',install_type='admin',platform='cros',extension_version='0.2.0',trigger='alarm',interval_minutes=5)
@pytest.fixture
def config(tmp_path):return StudentSettings(database_url='sqlite:///'+str(tmp_path/'student.db'),device_policy='allowlist',device_ids=('directory-test',),teacher_hash=password_hash(AUTH[1]),enabled=True)
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
def test_other_school_rejected(client):
    assert client.post('/api/student/status',json={**BASE,'school_id':'other'}).status_code==403

def test_school_email_does_not_require_manual_registration(config,monkeypatch):
    monkeypatch.setenv('TEST_ACCOUNT_EMAILS','different@goedu.kr')
    with TestClient(create_student_app(config)) as client:
        assert client.get('/health').json()['configured'] is True
        for email in ['unregistered@goedu.kr','another@goedu.kr','third@goedu.kr','fourth@goedu.kr']:
            result=client.post('/api/student/status',json={**BASE,'email':email})
            assert result.status_code==200 and result.json()['student_authenticated'] is False
        assert client.post('/api/student/status',json={**BASE,'email':'outsider@gmail.com'}).status_code==422
        assert upload(client,str(uuid4()),[event()],email='unregistered@goedu.kr').status_code==403
        window=begin(client)
        assert upload(client,window,[event()],email='unregistered@goedu.kr').status_code==200
def test_collection_only_during_teacher_window_device_checks_and_stop(client):
    assert upload(client,str(uuid4()),[event()]).status_code==403
    w=begin(client)
    assert client.post('/api/teacher/window/start',auth=AUTH).json()['window_id']==w
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
def test_on_state_and_collection_over_200_survive_new_vercel_instance(config):
    with TestClient(create_student_app(config)) as c:
        w=begin(c)
        for _ in range(10):assert upload(c,w,[event() for _ in range(20)]).status_code==200
    with TestClient(create_student_app(config)) as c:
        assert c.get('/api/student/window').json()['active'] is True
        assert upload(c,w,[event()]).status_code==200
def test_missing_device_ids_prevents_collection_and_invalid_school_waits(config):
    config.device_ids=()
    with TestClient(create_student_app(config)) as c:assert c.post('/api/teacher/window/start',auth=AUTH).status_code==409
    config.school_id='invalid school'
    with TestClient(create_student_app(config)) as c:assert c.post('/api/student/status',json=BASE).status_code==503
def test_vercel_rejects_sqlite(config,monkeypatch):
    monkeypatch.setenv('VERCEL','1')
    with pytest.raises(ValueError):create_student_app(config)

def test_on_lasts_past_ten_minutes_off_rejects_and_on_starts_new_run(config,monkeypatch):
    import student_test_app as module
    with TestClient(create_student_app(config)) as client:
        window=begin(client)
        future=module.now()+3600000
        monkeypatch.setattr(module,'now',lambda:future)
        state=client.get('/api/student/window').json()
        assert state['active'] and state['ends_at'] is None and state['mode']=='on-off'
        assert upload(client,window,[{**event(),'at':future}]).status_code==200
        assert client.post('/api/teacher/window/stop',auth=AUTH).status_code==200
        assert client.get('/api/student/window').json()['active'] is False
        assert upload(client,window,[{**event(),'at':future}]).status_code==403
        new_window=begin(client)
        assert new_window!=window
        assert upload(client,window,[{**event(),'at':future}]).status_code==403
        assert upload(client,new_window,[{**event(),'at':future}]).status_code==200

def test_teacher_dashboard_exposes_on_off_controls(client):
    page=client.get('/',auth=AUTH).text
    assert 'ON · 수집 시작' in page and 'OFF · 수집 중지' in page
    assert '10분 수집 시험 시작' not in page
    for control in ['email','range','site','kind','sort','query','reset']:
        assert 'id="'+control+'"' in page
    assert client.get('/student-dashboard-filters.js').status_code==401
    assert client.get('/student-dashboard-filters.js',auth=AUTH).status_code==200

def test_policy_mode_allows_admin_devices_without_ids_but_rejects_manual_install(config):
    config.device_policy='policy';config.device_ids=()
    with TestClient(create_student_app(config)) as client:
        window=begin(client)
        for platform in ['cros','win','mac']:
            assert upload(client,window,[event()],platform=platform,device_id=None).status_code==200
        assert upload(client,window,[event()],device_id=None,install_type='development').status_code==403
        assert client.post('/api/teacher/window/start').status_code==401
        client.post('/api/teacher/window/stop',auth=AUTH)
        assert upload(client,window,[event()],device_id=None).status_code==403


DIRECTORY_CSV='First Name [Required],Last Name [Required],Email Address [Required]\n길동,홍,PILOT-A@goedu.kr\n유령,김,roster-only@goedu.kr\n'

def test_directory_auth_origin_and_input_validation(client):
    assert client.post('/api/teacher/directory',content=DIRECTORY_CSV.encode()).status_code==401
    assert client.post('/api/teacher/directory',content=DIRECTORY_CSV.encode(),auth=AUTH,headers={'Origin':'https://other.test'}).status_code==403
    for invalid in ['wrong,headers\nx,y',DIRECTORY_CSV+'다른,이,pilot-a@goedu.kr\n',DIRECTORY_CSV+'외부,김,user@gmail.com\n']:
        assert client.post('/api/teacher/directory',content=invalid.encode(),auth=AUTH).status_code==422
    assert client.post('/api/teacher/directory',content=b'x'*(2*1024*1024+1),auth=AUTH).status_code==413
    assert client.get('/api/teacher/view',auth=AUTH).json()['statuses']==[]

def test_directory_only_enriches_observed_rows_and_updates_old_records(client,config):
    client.post('/api/student/status',json=BASE)
    client.post('/api/student/status',json={**BASE,'email':'unknown@goedu.kr'})
    w=begin(client);upload(client,w,[event()])
    result=client.post('/api/teacher/directory',content=DIRECTORY_CSV.encode('utf-8-sig'),auth=AUTH)
    assert result.status_code==200 and result.json()['matched_directory_entries']==2
    view=client.get('/api/teacher/view',auth=AUTH).json()
    statuses={row['email']:row for row in view['statuses']}
    assert len(statuses)==2 and 'roster-only@goedu.kr' not in statuses
    assert statuses[BASE['email']]['display_name']=='홍길동'
    assert statuses['unknown@goedu.kr']['display_name']==''
    assert view['events'][0]['display_name']=='홍길동'
    assert 'roster-only@goedu.kr' not in str(view)
    assert 'display_name' not in client.post('/api/student/status',json=BASE).json()
    corrected=DIRECTORY_CSV.replace('길동,홍','수정,홍')
    assert client.post('/api/teacher/directory',content=corrected.encode(),auth=AUTH).status_code==200
    with TestClient(create_student_app(config)) as restarted:
        assert restarted.get('/api/teacher/view',auth=AUTH).json()['events'][0]['display_name']=='홍수정'
        bad=corrected.replace('수정,홍','실패,김')+'빈,,invalid\n'
        assert restarted.post('/api/teacher/directory',content=bad.encode(),auth=AUTH).status_code==422
        assert restarted.get('/api/teacher/view',auth=AUTH).json()['events'][0]['display_name']=='홍수정'

def test_directory_school_scope_and_empty_roster_do_not_create_activity(client,config):
    client.post('/api/teacher/directory',content=DIRECTORY_CSV.encode(),auth=AUTH)
    assert client.get('/api/teacher/view',auth=AUTH).json()['events']==[]
    assert client.get('/api/teacher/view',auth=AUTH).json()['statuses']==[]
    client.post('/api/student/status',json=BASE)
    config.school_id='another-school'
    with TestClient(create_student_app(config)) as other:
        assert other.get('/api/teacher/view',auth=AUTH).json()['statuses'][0]['display_name']==''

def test_directory_parser_cp949_duplicate_and_safe_errors():
    from student_directory import parse_directory
    assert parse_directory((DIRECTORY_CSV+'길동,홍,pilot-a@goedu.kr\n').encode('cp949'))['pilot-a@goedu.kr']=='홍길동'
    for raw in [b'',b'\xff\xff',b'First Name [Required],Last Name [Required],Email Address [Required]\n"unclosed']:
        with pytest.raises(ValueError):parse_directory(raw)


def test_alias_requires_teacher_and_rejects_bad_input_and_cross_origin(client):
    value={'email':BASE['email'],'alias':'2학년 1반 3번'}
    assert client.post('/api/teacher/alias',json=value).status_code==401
    assert client.post('/api/teacher/alias',json=value,auth=AUTH,headers={'Origin':'https://other.test'}).status_code==403
    for bad in [{**value,'alias':'x'*81},{**value,'alias':'line\nfeed'},{**value,'email':'x@gmail.com'},{**value,'alias':None},{**value,'admin':True}]:
        assert client.post('/api/teacher/alias',json=bad,auth=AUTH).status_code==422
    assert client.get('/api/teacher/view',auth=AUTH).json()['statuses']==[]

def test_alias_separates_same_names_persists_reimport_and_clear_restores_name(client,config):
    roster=DIRECTORY_CSV+'길동,홍,pilot-b@goedu.kr\n'
    client.post('/api/teacher/directory',content=roster.encode(),auth=AUTH)
    for email in [BASE['email'],'pilot-b@goedu.kr']:client.post('/api/student/status',json={**BASE,'email':email})
    w=begin(client);upload(client,w,[event()])
    for email,alias in [(' PILOT-A@GOEDU.KR ',' 2학년 1반 3번 '),('pilot-b@goedu.kr','2학년 4반 12번')]:
        response=client.post('/api/teacher/alias',json={'email':email,'alias':alias},auth=AUTH)
        assert response.status_code==200 and response.json()['alias']==alias.strip()
    client.post('/api/teacher/directory',content=roster.encode(),auth=AUTH)
    with TestClient(create_student_app(config)) as restarted:
        view=restarted.get('/api/teacher/view',auth=AUTH).json()
        aliases={row['email']:row['alias'] for row in view['statuses']}
        assert aliases=={BASE['email']:'2학년 1반 3번','pilot-b@goedu.kr':'2학년 4반 12번'}
        assert view['events'][0]['alias']=='2학년 1반 3번'
        assert view['events'][0]['display_name']=='홍길동'
        assert restarted.post('/api/teacher/alias',json={'email':BASE['email'],'alias':'   '},auth=AUTH).status_code==200
        row=restarted.get('/api/teacher/view',auth=AUTH).json()['events'][0]
        assert row['alias']=='' and row['display_name']=='홍길동'

def test_alias_without_activity_stays_hidden_and_other_school_does_not_leak(client,config):
    client.post('/api/teacher/alias',json={'email':BASE['email'],'alias':'private-label'},auth=AUTH)
    view=client.get('/api/teacher/view',auth=AUTH).json()
    assert view['statuses']==[] and view['events']==[] and 'private-label' not in str(view)
    client.post('/api/student/status',json=BASE)
    config.school_id='other-school'
    with TestClient(create_student_app(config)) as other:
        assert other.get('/api/teacher/view',auth=AUTH).json()['statuses'][0]['alias']==''

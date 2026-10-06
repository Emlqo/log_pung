from io import BytesIO
import json
from zipfile import ZipFile
import pytest
from openpyxl import Workbook
from sqlalchemy import delete
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
from test_student_app import AUTH, BASE, config, client, begin, event, upload
from student_test_app import create_student_app, KnownStudent, StudentStatus, StudentMigration
from student_roster import parse_roster

def xlsx(rows=None):
    book=Workbook();sheet=book.active
    sheet.append([None,'2026학년도 1학년'])
    sheet.append([None,'학년','반','번호','성명','특이사항'])
    for row in rows or [('1학년',1,1,'가학생'),('1학년',1,2,'나학생'),('1학년',2,1,'다학생')]:
        sheet.append([None,*row,'DO NOT STORE'])
    out=BytesIO();book.save(out);book.close();return out.getvalue()

def directory(c, rows=None):
    rows=rows or [('가학생','a'),('나학생','b'),('다학생','c')]
    body='First Name [Required],Last Name [Required],Email Address [Required]\n'+''.join(f'{name},,{email}@goedu.kr\n' for name,email in rows)
    assert c.post('/api/teacher/directory',content=body.encode(),auth=AUTH).status_code==200

def roster(c, content=None):return c.post('/api/teacher/roster?year=2026',content=content or xlsx(),auth=AUTH)
def students(c,year=2026):
    response=c.get(f'/api/teacher/classes?year={year}',auth=AUTH);assert response.status_code==200
    return response.json()['students']
def register(c,email='a'):assert c.post('/api/student/status',json={**BASE,'email':email+'@goedu.kr'}).status_code==200
def assign(c,**kwargs):return c.post('/api/teacher/class-assignment',auth=AUTH,json={'year':2026,'email':'a@goedu.kr','grade':1,'classroom':2,**kwargs})

def test_template_parser_only_needed_columns_and_repeated_headers():
    rows=parse_roster(xlsx(),2026)
    assert rows[0]==dict(grade=1,classroom=1,number=1,name='가학생')
    assert 'DO NOT STORE' not in json.dumps(rows)
    with pytest.raises(ValueError):parse_roster(xlsx(),2027)
    with pytest.raises(ValueError):parse_roster(b'not xlsx',2026)
    with pytest.raises(ValueError):parse_roster(xlsx([('1학년',1,1,'가'),('1학년',1,1,'나')]),2026)
    with pytest.raises(ValueError):parse_roster(xlsx([('1학년',1,'x','가')]),2026)

def test_only_registered_students_and_late_refresh(client):
    directory(client);assert roster(client).status_code==200
    assert students(client)==[]
    register(client)
    a=students(client);assert len(a)==1 and a[0]['source']=='auto' and a[0]['number']==1
    register(client,'b')
    assert len(students(client))==2
    assert all(s['email']!='c@goedu.kr' for s in students(client))

def test_duplicate_in_unseen_directory_is_ambiguous(client):
    directory(client,[('가학생','a'),('가학생','unseen')]);roster(client);register(client)
    row=students(client)[0]
    assert row['source']=='unassigned' and '동명이인' in row['reason']

def test_duplicate_roster_and_unknown_name(client):
    directory(client);roster(client,xlsx([('1학년',1,1,'가학생'),('1학년',2,1,'가학생')]));register(client);register(client,'b');register(client,'unknown')
    result={r['email']:r for r in students(client)}
    assert '동명이인' in result['a@goedu.kr']['reason']
    assert '명렬표' in result['b@goedu.kr']['reason']
    assert '이름' in result['unknown@goedu.kr']['reason']

def test_optional_number_manual_survives_upload_alias_directory_and_restart(client,config):
    directory(client);roster(client);register(client)
    assert assign(client).status_code==200
    assert client.post('/api/teacher/alias',auth=AUTH,json={'email':'a@goedu.kr','alias':'별칭'}).status_code==200
    directory(client);roster(client)
    with TestClient(create_student_app(config)) as other:
        row=students(other)[0]
        assert (row['source'],row['classroom'],row['number'],row['alias'])==('manual',2,None,'별칭')
        assert assign(other,reset=True).status_code==200
        assert students(other)[0]['source']=='auto'

def test_retained_identity_after_activity_retention(client,config,monkeypatch):
    import student_test_app as module
    directory(client);roster(client);register(client)
    future=module.now()+2*86400000;monkeypatch.setattr(module,'now',lambda:future)
    with TestClient(create_student_app(config)) as other:
        assert other.get('/api/teacher/view',auth=AUTH).json()['statuses']==[]
        assert students(other)[0]['email']=='a@goedu.kr'

def test_migrates_old_status_before_pruning(config):
    app=create_student_app(config)
    with TestClient(app):pass
    with Session(app.state.engine) as db:
        db.execute(delete(StudentMigration));db.add(StudentStatus(email='old@goedu.kr',received=1,data=json.dumps({**BASE,'email':'old@goedu.kr'})));db.commit()
    with TestClient(create_student_app(config)) as other:
        assert students(other)[0]['email']=='old@goedu.kr'

def test_events_alone_register_and_rejected_events_do_not(client):
    assert upload(client,'x'*36,[event()],email='a@goedu.kr').status_code==403
    assert students(client)==[]
    assert upload(client,begin(client),[event()],email='a@goedu.kr').status_code==200
    assert students(client)[0]['email']=='a@goedu.kr'

def test_roster_and_assignments_school_year_isolation(client,config):
    directory(client);roster(client);register(client);assign(client)
    assert students(client,2027)[0]['source']=='unassigned'
    config.school_id='other'
    with TestClient(create_student_app(config)) as other:
        assert students(other)==[]
        assert other.post('/api/student/status',json={**BASE,'school_id':'other','email':'a@goedu.kr'}).status_code==200
        assert students(other)[0]['source']=='unassigned'

def test_upload_invalid_atomic_and_assignment_validation(client):
    directory(client);roster(client);register(client)
    assert roster(client,b'bad').status_code==422
    assert students(client)[0]['source']=='auto'
    assert assign(client,email='unseen@goedu.kr').status_code==404
    for changes in ({'grade':0},{'number':0},{'number':'1'},{'classroom':None},{'email':'x@example.org'}):
        assert assign(client,**changes).status_code==422
    assert assign(client,number=None).status_code==200

def test_manual_seat_conflict_and_auto_collision(client):
    directory(client);roster(client);register(client);register(client,'b')
    assert assign(client,number=2,classroom=1).status_code==200
    b=next(s for s in students(client) if s['email']=='b@goedu.kr')
    assert b['source']=='unassigned'
    assert assign(client,email='b@goedu.kr',number=2,classroom=1).status_code==409
    assert assign(client,email='b@goedu.kr',number=None,classroom=1).status_code==200

def test_teacher_auth_csrf_and_size_limit(client):
    assert client.get('/api/teacher/classes?year=2026').status_code==401
    assert client.post('/api/teacher/roster?year=2026',content=xlsx()).status_code==401
    assert client.post('/api/teacher/class-assignment',json={}).status_code==401
    assert client.post('/api/teacher/roster?year=2026',auth=AUTH,content=xlsx(),headers={'origin':'https://evil.invalid'}).status_code==403
    assert roster(client,b'x'*(2*1024*1024+1)).status_code==413
    assert client.get('/api/teacher/classes?year=1',auth=AUTH).status_code==422

def test_zip_expansion_limit():
    stream=BytesIO()
    with ZipFile(stream,'w') as z:
        for i in range(201):z.writestr(str(i),'')
    with pytest.raises(ValueError):parse_roster(stream.getvalue(),2026)

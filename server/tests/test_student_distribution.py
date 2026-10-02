import hashlib
import xml.etree.ElementTree as ET
from pathlib import Path
from fastapi.testclient import TestClient
from student_test_app import create_student_app, StudentSettings

def test_public_update_and_signed_package_without_database_or_teacher_login():
    client=TestClient(create_student_app(StudentSettings(database_url='',teacher_hash='',enabled=False)))
    response=client.get('/distribution/updates.xml?x=updatecheck')
    assert response.status_code==200 and 'application/xml' in response.headers['content-type']
    xml=ET.fromstring(response.content)
    app=xml.find('{http://www.google.com/update2/response}app')
    check=app.find('{http://www.google.com/update2/response}updatecheck')
    assert len(app.attrib['appid'])==32
    assert check.attrib['codebase'].startswith('https://log-pung.vercel.app/distribution/')
    name=check.attrib['codebase'].rsplit('/',1)[1]
    crx=client.get('/distribution/'+name)
    assert crx.status_code==200 and crx.headers['content-type']=='application/x-chrome-extension'
    assert crx.content[:4]==b'Cr24'
    local=Path(__file__).resolve().parents[1]/'distribution'/name
    assert hashlib.sha256(crx.content).digest()==hashlib.sha256(local.read_bytes()).digest()

def test_distribution_does_not_expose_secrets_or_teacher_screen():
    client=TestClient(create_student_app(StudentSettings(database_url='',teacher_hash='',enabled=False)))
    for path in ['/distribution/signing.pem','/distribution/.env','/distribution/student-dashboard.html',
                 '/distribution/student-email-test-999.0.crx','/distribution/%2e%2e/app.py']:
        assert client.get(path).status_code==404
    assert client.get('/api/teacher/view').status_code==503

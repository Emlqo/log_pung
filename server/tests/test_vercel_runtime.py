"""Exercise the deployment entry point and a serverless cold request without lifespan."""
import json
import runpy
from pathlib import Path
from fastapi.testclient import TestClient
from app import password_hash
from student_test_app import create_student_app, StudentSettings

ROOT=Path(__file__).resolve().parents[2]
AUTH=('teacher','runtime-test-password')

def test_entrypoint_executes_app_and_does_not_serve_source(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT))
    monkeypatch.setenv('DATABASE_URL','')
    monkeypatch.setenv('TEACHER_PASSWORD_HASH',password_hash(AUTH[1]))
    deployed=runpy.run_path(str(ROOT/'index.py'))['app']
    client=TestClient(deployed)
    assert client.get('/health').json()['mode']=='unverified-email-pilot'
    assert client.get('/').status_code==401
    page=client.get('/',auth=AUTH)
    assert page.status_code==200 and 'text/html' in page.headers['content-type']
    for path in ['/index.py','/server/student_test_app.py','/.env','/requirements.txt']:
        assert client.get(path,auth=AUTH).status_code==404

def test_cold_request_initializes_database_without_startup(tmp_path):
    cfg=StudentSettings(database_url='sqlite:///'+str(tmp_path/'cold.db'),
        teacher_hash=password_hash(AUTH[1]),enabled=True)
    # No context manager: TestClient sends no lifespan startup event.
    client=TestClient(create_student_app(cfg))
    assert client.get('/api/student/window').json()['active'] is False
    assert client.get('/api/teacher/view',auth=AUTH).status_code==200

def test_cold_database_failure_is_safe_and_retryable(tmp_path):
    cfg=StudentSettings(database_url='sqlite:///'+str(tmp_path/'missing'/'cold.db'),
        enabled=True)
    client=TestClient(create_student_app(cfg))
    response=client.get('/api/student/window')
    assert response.status_code==503 and str(tmp_path) not in response.text
    (tmp_path/'missing').mkdir()
    assert client.get('/api/student/window').status_code==200

def test_deployment_routes_every_request_to_python_function():
    config=json.loads((ROOT/'vercel.json').read_text())
    assert config['builds']==[{'src':'index.py','use':'@vercel/python'}]
    assert config['routes']==[{'src':'/(.*)','dest':'/index.py'}]
    assert (ROOT/'requirements.txt').is_file()


def test_excel_dependencies_declared_in_both_deployment_manifests():
    import tomllib
    from packaging.requirements import Requirement
    pyproject=tomllib.loads((ROOT/'pyproject.toml').read_text(encoding='utf-8'))
    declared={Requirement(value).name for value in pyproject['project']['dependencies']}
    requirements={Requirement(value).name for value in (ROOT/'requirements.txt').read_text().splitlines() if value.strip() and not value.startswith('#')}
    assert {'openpyxl','defusedxml','et-xmlfile'} <= declared & requirements

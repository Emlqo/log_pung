import json
from pathlib import Path
import pytest
from sqlalchemy.engine import make_url
from app import password_hash
from production_run import production_settings

def valid_env():
    # Test fixtures, not issued production identifiers.
    return dict(PILOT_DOMAIN='pilot.school-fixture.kr',GOOGLE_CLIENT_ID='fixture.apps.googleusercontent.com',SCHOOL_ID='pilot',TEST_ACCOUNT_EMAILS='a@goedu.kr,b@goedu.kr',POSTGRES_PASSWORD_FILE='db',TEACHER_PASSWORD_HASH_FILE='teacher')

def secrets():
    return {'db':'a/complex:@password#with%characters','teacher':password_hash('test-teacher-password')}

@pytest.mark.parametrize('change',[
    {'PILOT_DOMAIN':''}, {'PILOT_DOMAIN':'pilot.example.invalid'},
    {'PILOT_DOMAIN':'https://pilot.school-fixture.kr'}, {'GOOGLE_CLIENT_ID':''},
    {'TEST_ACCOUNT_EMAILS':''}, {'TEST_ACCOUNT_EMAILS':'a@goedu.kr'},
    {'TEST_ACCOUNT_EMAILS':'a@goedu.kr,a@goedu.kr'},
    {'TEST_ACCOUNT_EMAILS':'a@goedu.kr,b@gmail.com'},
    {'TEST_ACCOUNT_EMAILS':'a@goedu.kr,b@goedu.kr,c@goedu.kr,d@goedu.kr'},
    {'DEVICE_POLICY':'allowlist','ALLOWED_DEVICE_IDS':''}
])
def test_incomplete_or_broad_student_deployment_refused(change):
    env={**valid_env(),**change}
    with pytest.raises(ValueError): production_settings(env,secrets().__getitem__)

def test_production_secrets_and_reserved_password_characters():
    secret=secrets();cfg=production_settings(valid_env(),secret.__getitem__)
    assert make_url(cfg.database_url).password==secret['db']
    assert cfg.accounts==('a@goedu.kr','b@goedu.kr')
    assert cfg.device_policy=='diagnostic'
    for change in ({'db':'short'},{'teacher':'plaintext-password'}):
        with pytest.raises(ValueError): production_settings(valid_env(),{**secret,**change}.__getitem__)

def test_db_and_api_have_no_public_port_and_teacher_hash_is_secret():
    root=Path(__file__).resolve().parents[2]
    compose=json.loads((root/'deploy/school-server/compose.json').read_text())
    services=compose['services']
    assert 'ports' not in services['api'] and 'ports' not in services['db']
    assert services['proxy']['ports']==['80:80','443:443']
    assert services['api']['environment']['TEACHER_PASSWORD_HASH_FILE']=='/run/secrets/teacher_hash'
    assert 'TEACHER_PASSWORD_HASH' not in services['api']['environment']
    assert 'local_test_app' not in (root/'deploy/school-server/Dockerfile').read_text()

"""실제 loopback HTTP + DB 왕복. 브라우저 탐색은 모의이며 운영 데이터/암호를 사용하지 않음."""
import os
os.environ['DISABLE_SQLALCHEMY_CEXT_RUNTIME']='1'
import secrets
import json
import sys
import threading
import tempfile
import time
import subprocess
from pathlib import Path
import httpx
import uvicorn
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'server'))
from app import password_hash
from local_test_app import create_local_app,LocalSettings
work=root.parents[1]/'work';work.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='local-http-smoke-',dir=work) as directory:
    assert Path(directory).resolve().parent==work.resolve()
    password=secrets.token_urlsafe(24)
    app=create_local_app(LocalSettings(database_url='sqlite:///'+str(Path(directory)/'test.db'),teacher_hash=password_hash(password)))
    server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=8765,access_log=False,log_level='warning'))
    thread=threading.Thread(target=server.run,daemon=True);thread.start()
    try:
        for _ in range(100):
            if server.started:break
            if not thread.is_alive():raise RuntimeError('시험 서버 시작 실패: 8765 포트를 확인하세요.')
            time.sleep(.05)
        assert server.started
        with httpx.Client(base_url='http://127.0.0.1:8765',timeout=10) as client:
            assert client.get('/api/local/view').status_code==401
            response=client.post('/api/local/login',auth=('teacher',password));assert response.status_code==200
            session=response.json()
            result=subprocess.run(['node',str(root/'scripts/local-http-smoke.mjs')],input=json.dumps({'token':session['token'],'runId':session['run_id'],'expiresAt':session['expires_at']}),text=True,capture_output=True,cwd=root,timeout=30)
            assert result.returncode==0,result.stderr
            print(result.stdout.strip())
            rows=client.get('/api/local/view',auth=('teacher',password)).json();assert len(rows)==2
            assert any(row['search']=='teacher synthetic test' for row in rows)
            assert all('?' not in row['url'] and 'email' not in row and 'device_id' not in row for row in rows)
            assert client.get('/',auth=('teacher',password)).status_code==200
            assert client.delete('/api/local/records',auth=('teacher',password)).status_code==200
            assert client.get('/api/local/view',auth=('teacher',password)).json()==[]
            print('real HTTP -> SQLite -> authenticated teacher view -> deletion: PASS')
    finally:
        server.should_exit=True;thread.join(timeout=10)
        if thread.is_alive():raise RuntimeError('시험 서버 종료 실패')

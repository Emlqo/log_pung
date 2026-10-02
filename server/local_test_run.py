import os
os.environ['DISABLE_SQLALCHEMY_CEXT_RUNTIME']='1'
import getpass
import uvicorn
from app import password_hash
from local_test_app import create_local_app,LocalSettings
if __name__=='__main__':
    password=getpass.getpass('교사용 시험 비밀번호 (영문/숫자/기호 12자 이상, 이번 실행에만 사용): ')
    if len(password)<12 or not password.isascii():raise SystemExit('ASCII 문자 12자 이상 입력하세요.')
    cfg=LocalSettings(teacher_hash=password_hash(password));del password
    print('교사 본인 PC 전용: http://127.0.0.1:8765 · 사용자 teacher · 학생 배포용 아님')
    uvicorn.run(create_local_app(cfg),host='127.0.0.1',port=8765,access_log=False)

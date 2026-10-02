import getpass
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import password_hash
password=getpass.getpass('교사용 서버 비밀번호 (12자 이상): ')
if len(password)<12: raise SystemExit('12자 이상 입력하세요')
print('TEACHER_PASSWORD_HASH='+password_hash(password))

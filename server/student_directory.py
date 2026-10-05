"""Parse a private Google Admin CSV without retaining unrelated columns."""
import csv
import io
import re

MAX_DIRECTORY_BYTES = 2 * 1024 * 1024

def parse_directory(data: bytes) -> dict[str, str]:
    if len(data) > MAX_DIRECTORY_BYTES:
        raise ValueError('CSV는 2MB 이하만 등록할 수 있습니다.')
    try:
        content = data.decode('utf-8-sig')
    except UnicodeError:
        try:
            content = data.decode('cp949')
        except UnicodeError:
            raise ValueError('UTF-8 또는 CP949 CSV 파일을 선택해주세요.') from None
    reader = csv.DictReader(io.StringIO(content, newline=''), strict=True)
    columns = ('First Name [Required]', 'Last Name [Required]', 'Email Address [Required]')
    try:
        headers = reader.fieldnames or []
        if any(headers.count(c) != 1 for c in columns):
            raise ValueError('Google 관리자 내보내기의 First Name, Last Name, Email Address [Required] 열이 필요합니다.')
        result = {}
        for number, row in enumerate(reader, 2):
            if number > 10001:
                raise ValueError('명단은 10,000명 이하만 등록할 수 있습니다.')
            if not any(row.values()):
                continue
            if None in row or any(row[c] is None for c in columns):
                raise ValueError(f'{number}행의 CSV 열 개수를 확인해주세요.')
            first, last, email = (row[c].strip() for c in columns)
            email = email.lower()
            name = last + first if re.fullmatch(r'[가-힣]+', last + first) else ' '.join(x for x in (last, first) if x)
            if len(email) > 254 or not re.fullmatch(r'[^@\s]+@goedu\.kr', email):
                raise ValueError(f'{number}행의 학교 이메일 형식을 확인해주세요.')
            if not name or len(name) > 200 or any(ord(c) < 32 for c in name):
                raise ValueError(f'{number}행의 이름을 확인해주세요.')
            if email in result and result[email] != name:
                raise ValueError(f'{number}행에 동일 이메일의 서로 다른 이름이 있습니다.')
            result[email] = name
    except csv.Error:
        raise ValueError('CSV 형식을 읽을 수 없습니다.') from None
    if not result:
        raise ValueError('등록할 이름과 이메일이 없습니다.')
    return result

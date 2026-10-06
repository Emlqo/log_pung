"""Emit source-only tree entries. NEVER include generated secrets or student records."""
import json
import sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
names=['README.md','package.json','package-lock.json','.gitignore','.vercelignore','.env.example','index.py','pyproject.toml','requirements.txt','pytest.ini','vercel.json','compose.yaml','start-local-collection.cmd']
files=[root/name for name in names]
for directory in ['extension','local-test','student-test','scripts','server','docs','policy','deploy','.github']:
    files.extend((root/directory).rglob('*'))
entries=[]
for path in sorted(set(files)):
    if not path.is_file():continue
    rel=path.relative_to(root)
    if any(p in {'__pycache__','.pytest_cache','secrets','node_modules','.venv','.git','.vercel'} for p in rel.parts):continue
    if path.name=='.env' or path.suffix in {'.xlsx','.xls','.csv','.db','.pyc','.pem','.key','.crx','.zip','.png'}:continue
    content=path.read_text(encoding='utf-8')
    if any(('-----BEGIN '+kind+'-----') in content for kind in ('PRIVATE KEY','RSA PRIVATE KEY')):
        raise SystemExit('Private key material refused')
    entries.append({'path':rel.as_posix(),'mode':'100644','type':'blob','content':content})
if '--summary' in sys.argv:
    print(json.dumps({'count':len(entries),'paths':[e['path'] for e in entries]},ensure_ascii=False))
else:
    offset=int(sys.argv[1]) if len(sys.argv)>1 else 0
    limit=int(sys.argv[2]) if len(sys.argv)>2 else len(entries)
    print(json.dumps(entries[offset:offset+limit],ensure_ascii=False))

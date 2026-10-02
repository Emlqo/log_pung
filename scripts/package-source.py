"""개발 환경·DB·비밀정보를 제외한 전달용 프로젝트 압축."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
destination=root.parent/'classroom-pilot-project.zip'
files=[root/name for name in ['README.md','package.json','package-lock.json','.gitignore','compose.yaml','start-local-collection.cmd','index.py','pyproject.toml','requirements.txt','vercel.json','.env.example','.vercelignore','pytest.ini']]
for directory in ['extension','scripts','policy','docs','dist','server','deploy','local-test','local-test-dist','student-test','student-test-dist','.github']:
    for item in (root/directory).rglob('*'):
        if not item.is_file(): continue
        if any(part in {'__pycache__','.pytest_cache','secrets'} for part in item.parts): continue
        if item.name=='.env' or item.suffix in {'.db','.pyc','.pem','.key'}: continue
        if item.suffix=='.crx' and item.parent!=root/'server'/'distribution': continue
        files.append(item)
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as archive:
    for item in files: archive.write(item,Path('classroom-pilot')/item.relative_to(root))
print(destination)

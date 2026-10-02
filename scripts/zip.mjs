import {readdir,readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
const files={};
for(const name of ['manifest.json','worker.js','core.js','popup.js','popup.html','popup.css','managed-schema.json','icon-16.png','icon-48.png','icon-128.png']) files[name]=new Uint8Array(await readFile('dist/'+name));
const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
await writeFile(`classroom-pilot-${manifest.version}.zip`,zipSync(files));
console.log('게시용 ZIP 생성 (실제 게시 전 서버 원점·OAuth 설정 확인)');

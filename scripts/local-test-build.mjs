import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {icons} from './icons.mjs';
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','local-test/tsconfig.json'],{stdio:'inherit'});
await mkdir('local-test-dist',{recursive:true});
for(const name of ['manifest.json','popup.html','popup.css'])await cp('local-test/'+name,'local-test-dist/'+name);
await icons('local-test-dist');
console.log('교사 본인 로컬 시험 빌드 완료: local-test-dist · 인증·직접 시작 전 수집 없음 · 127.0.0.1 시험 서버만 허용');

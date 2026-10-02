import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {icons} from './icons.mjs';
import {createPublicKey} from 'node:crypto';
const origin=process.env.PILOT_SERVER_ORIGIN || 'https://pilot.example.invalid';
const url=new URL(origin);
if(url.protocol!=='https:' || url.origin!==origin || url.username || url.password) throw Error('PILOT_SERVER_ORIGIN은 HTTPS 원점만 허용');
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','-p','extension/tsconfig.json'],{stdio:'inherit'});
await mkdir('dist',{recursive:true});
await icons();
for(const file of ['popup.html','popup.css','managed-schema.json']) await cp('extension/'+file,'dist/'+file);
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
manifest.host_permissions=[origin+'/*'];
if(process.env.GOOGLE_CLIENT_ID){
 if(!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(process.env.GOOGLE_CLIENT_ID)) throw Error('OAuth client ID 형식 오류');
 manifest.oauth2={client_id:process.env.GOOGLE_CLIENT_ID,scopes:['openid','https://www.googleapis.com/auth/userinfo.email']};
}
if(process.env.EXTENSION_PUBLIC_KEY){
 const value=process.env.EXTENSION_PUBLIC_KEY;
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('EXTENSION_PUBLIC_KEY는 공개 SPKI DER의 한 줄 base64만 허용합니다. PEM 비밀키 입력 금지.');
 const key=createPublicKey({key:Buffer.from(value,'base64'),type:'spki',format:'der'});
 if(key.export({type:'spki',format:'der'}).toString('base64')!==value)throw Error('공개 키 base64 불일치');
 manifest.key=value;
}
await writeFile('dist/manifest.json',JSON.stringify(manifest,null,2));
console.log('빌드 완료: dist (OAuth 미설정 시 안전 대기)');

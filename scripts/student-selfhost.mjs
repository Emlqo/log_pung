import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assets,makeSelfHost} from './distribution-lib.mjs';
const {values}=parseArgs({options:{key:{type:'string'},'base-url':{type:'string'}}});
if(!values.key||!values['base-url'])throw Error('--key 안전한 PEM 경로 --base-url 실제 HTTPS 주소/distribution 필요');
const base=new URL(values['base-url']);
if(base.pathname!=='/distribution')throw Error('이 서버의 배포 폴더는 /distribution입니다.');
const r=makeSelfHost(await assets(pathToFileURL(resolve('student-test-dist')+'/'),'student'),await readFile(values.key,'utf8'),values['base-url'],'student');
const destination=resolve('server/distribution');await mkdir(destination,{recursive:true});
try{const old=await readFile(destination+'/'+r.name);if(!old.equals(r.crx))throw Error('동일 버전의 CRX 변경 금지: student-test/manifest.json 버전을 올려주세요.');}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(destination+'/'+r.name,r.crx);
await writeFile(destination+'/updates.xml.tmp',r.xml);await rename(destination+'/updates.xml.tmp',destination+'/updates.xml');
const policy={serverUrl:base.origin,schoolId:'school-pilot',testEnabled:true,intervalMinutes:5,devicePolicy:'diagnostic',allowedDeviceIds:[]};
await writeFile('policy/student-selfhost-diagnostic.json',JSON.stringify(policy,null,2)+'\n');
await writeFile('policy/student-selfhost-inputs.json',JSON.stringify({...r.inputs,studentAuthenticated:false,mode:'diagnostic until explicit device allowlist and teacher window'},null,2)+'\n');
console.log(JSON.stringify({extensionId:r.inputs.extensionId,customUpdateUrl:r.inputs.customUpdateUrl,crx:r.name,signatureVerified:true,policyInstallVerified:false},null,2));

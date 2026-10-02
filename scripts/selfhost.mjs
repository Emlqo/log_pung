import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assets,makeSelfHost} from './distribution-lib.mjs';
const {values}=parseArgs({options:{key:{type:'string'},'base-url':{type:'string'}}});
if(!values.key||!values['base-url'])throw Error('--key PEM경로 --base-url 실제-HTTPS-배포폴더 필수. ZIP/교사 화면 URL 사용 금지.');
const result=makeSelfHost(await assets(pathToFileURL(resolve('dist')+'/')),await readFile(values.key,'utf8'),values['base-url']);
const destination=resolve('release/selfhost/'+result.inputs.extensionId);
await mkdir(destination,{recursive:true});
try {
 const old=await readFile(destination+'/'+result.name);
 if(createHash('sha256').update(old).digest('hex')!==result.inputs.sha256)throw Error('동일 버전의 다른 CRX 덮어쓰기 금지. extension/manifest.json 버전을 올리고 다시 빌드하세요.');
}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(destination+'/'+result.name,result.crx);
// CRX 먼저 게시하고 updates.xml을 마지막에 원자적으로 교체할 것.
await writeFile(destination+'/updates.xml',result.xml);
await writeFile(destination+'/deployment-inputs.json',JSON.stringify(result.inputs,null,2));
console.log('생성 완료: '+destination+'\n입력 ID: '+result.inputs.extensionId+'\n맞춤 URL: '+result.inputs.customUpdateUrl+'\n외부 호스팅/정책 설치/자동 인증은 아직 검증되지 않았습니다.');

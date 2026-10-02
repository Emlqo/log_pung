import {parseArgs} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createPublicKey} from 'node:crypto';
import {validId,extensionId,assertPilot} from './distribution-lib.mjs';
const {values}=parseArgs({options:{id:{type:'string'},'public-key-file':{type:'string'}}});
const id=validId(values.id||'');
if(values['public-key-file']){
 const key=await readFile(values['public-key-file'],'utf8');
 const der=key.includes('BEGIN PUBLIC KEY')?createPublicKey(key).export({format:'der',type:'spki'}):Buffer.from(key.trim(),'base64');
 createPublicKey({key:der,type:'spki',format:'der'});
 if(extensionId(der)!==id)throw Error('웹 스토어 Item ID와 공개 키가 일치하지 않습니다.');
}
const manifest=JSON.parse(await readFile('dist/manifest.json','utf8'));assertPilot(manifest);
if(manifest.key&&extensionId(Buffer.from(manifest.key,'base64'))!==id)throw Error('빌드 manifest 공개 키와 Item ID가 일치하지 않습니다.');
if(manifest.update_url)throw Error('웹 스토어 빌드에 자체 호스팅 update_url이 있습니다. 다시 빌드하세요.');
await mkdir('release/webstore',{recursive:true});
await writeFile('release/webstore/deployment-inputs.json',JSON.stringify({distribution:'webstore',extensionId:id,adminSource:'Chrome 웹 스토어에서 추가',customUpdateUrl:null,webStoreListingUrl:'https://chromewebstore.google.com/detail/'+id,publicKeyMatches:!!values['public-key-file'],storePublishedAndApproved:false,policyInstallVerified:false,deviceIdentityVerified:false,silentAuthVerified:false},null,2));
console.log('관리자 입력 파일 생성 완료. ID 형식/선택 공개키만 검증했으며 온라인 게시·심사 상태는 확인하지 않았습니다.');

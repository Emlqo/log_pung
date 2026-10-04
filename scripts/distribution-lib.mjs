import {createHash,createPrivateKey,createPublicKey,sign,verify,constants} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';

export const ASSETS=['manifest.json','worker.js','core.js','popup.js','popup.html','popup.css','managed-schema.json','icon-16.png','icon-48.png','icon-128.png'];
export const STUDENT_ASSETS=['manifest.json','managed-schema.json','popup.html','popup.css','icon-16.png','icon-48.png','icon-128.png','student-test/src/worker.js','student-test/src/popup.js','extension/src/core.js','local-test/src/core.js'];
export function assertStudentPilot(manifest){
 const expected=['alarms','enterprise.deviceAttributes','identity','identity.email','storage','webNavigation'];
 if(manifest.manifest_version!==3||JSON.stringify([...manifest.permissions].sort())!==JSON.stringify(expected)||manifest.content_scripts||manifest.optional_permissions?.length||manifest.optional_host_permissions?.length||manifest.oauth2||manifest.incognito!=='not_allowed')throw Error('학생용 수집 manifest 불일치');
 if(manifest.host_permissions?.length!==1||!/^https:\/\/[^/]+\/\*$/.test(manifest.host_permissions[0]))throw Error('학생 시험 서버는 단일 HTTPS 원점 필요');
 if(manifest.background?.service_worker!=='student-test/src/worker.js'||manifest.background.type!=='module'||!/^\d+(\.\d+){1,3}$/.test(manifest.version))throw Error('학생 시험 worker·버전 오류');
}
function rules(profile){
 if(profile==='diagnostic')return {names:ASSETS,check:assertPilot};
 if(profile==='student')return {names:STUDENT_ASSETS,check:assertStudentPilot};
 throw Error('지원하지 않는 배포 프로필');
}
export function extensionId(publicDer){return createHash('sha256').update(publicDer).digest().subarray(0,16).toString('hex').replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));}
export function validId(id){if(!/^[a-p]{32}$/.test(id)||/^(.)\1{31}$/.test(id))throw Error('실제 확장 ID(32자 a~p)가 필요합니다. 반복 문자 예시 ID는 허용하지 않습니다.');return id;}
export function publicKey(privatePem){const key=createPrivateKey(privatePem);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw Error('RSA 2048비트 이상 PEM 키 필요');return createPublicKey(key).export({type:'spki',format:'der'});}
export function httpsBase(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.hostname==='localhost'||/\.(invalid|example|test|localhost|local)$/.test(url.hostname)||/(^|\.)example\.(com|org|net)$/.test(url.hostname))throw Error('예시가 아닌 실제 HTTPS 배포 주소가 필요합니다.');
 if(url.pathname.endsWith('.zip')||url.pathname.endsWith('.crx')||url.pathname.endsWith('.xml'))throw Error('파일 URL이 아닌 배포 폴더 HTTPS 주소를 입력하세요.');
 return url.href.replace(/\/$/,'');
}
export function assertPilot(manifest){
 const expected=['alarms','enterprise.deviceAttributes','identity','identity.email','storage'];
 if(manifest.manifest_version!==3||JSON.stringify([...manifest.permissions].sort())!==JSON.stringify(expected)||manifest.content_scripts||manifest.optional_permissions?.length||manifest.optional_host_permissions?.length)throw Error('기록 수집 없는 시험 manifest와 불일치');
 if(manifest.host_permissions?.length!==1||!/^https:\/\/[^/]+\/\*$/.test(manifest.host_permissions[0]))throw Error('진단 서버 권한은 하나의 HTTPS 원점만 허용');
 if(!/^\d+(\.\d+){1,3}$/.test(manifest.version))throw Error('확장 버전 오류');
}
export async function assets(directory,profile='diagnostic'){const files={};for(const name of rules(profile).names)files[name]=new Uint8Array(await readFile(new URL(name,directory)));return files;}
const varint=n=>{const out=[];do{out.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(out);};
const field=(tag,data)=>Buffer.concat([varint(tag*8+2),varint(data.length),Buffer.from(data)]);
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const context=Buffer.from('CRX3 SignedData\0');
// Chromium crx_creator.cc와 동일한 RSA_PKCS1_SHA256 서명 형식.
export function packCrx3(zip,privatePem){
 const key=createPrivateKey(privatePem),pub=publicKey(privatePem);
 const idBytes=createHash('sha256').update(pub).digest().subarray(0,16);
 const signed=field(1,idBytes);
 const message=Buffer.concat([context,u32(signed.length),signed,Buffer.from(zip)]);
 const signature=sign('sha256',message,{key,padding:constants.RSA_PKCS1_PADDING});
 const header=Buffer.concat([field(2,Buffer.concat([field(1,pub),field(2,signature)])),field(10000,signed)]);
 return Buffer.concat([Buffer.from('Cr24'),u32(3),u32(header.length),header,Buffer.from(zip)]);
}
function fields(bytes){
 let cursor=0;const out=new Map();
 function integer(){let value=0,multiplier=1;for(let i=0;i<6;i++){if(cursor>=bytes.length)throw Error('잘린 protobuf');const b=bytes[cursor++];value+=(b&127)*multiplier;if(!(b&128))return value;multiplier*=128;}throw Error('protobuf 정수 길이 오류');}
 while(cursor<bytes.length){const tag=integer();if((tag&7)!==2)throw Error('지원하지 않는 CRX 필드');const length=integer();if(cursor+length>bytes.length)throw Error('잘린 CRX 필드');const number=Math.floor(tag/8);if(out.has(number))throw Error('중복 CRX 필드');out.set(number,bytes.subarray(cursor,cursor+length));cursor+=length;}
 return out;
}
export function inspectCrx3(input,profile='diagnostic'){
 const crx=Buffer.from(input);if(crx.length<12||crx.subarray(0,4).toString()!=='Cr24'||crx.readUInt32LE(4)!==3)throw Error('CRX3 형식 아님');
 const n=crx.readUInt32LE(8);if(n>1024*1024||12+n>=crx.length)throw Error('CRX 헤더 길이 오류');
 const header=fields(crx.subarray(12,12+n));if(!header.has(2)||!header.has(10000))throw Error('CRX 증명 부재');
 const proof=fields(header.get(2)),signed=header.get(10000),pub=proof.get(1),signature=proof.get(2);
 if(!pub||!signature)throw Error('서명 정보 부재');
 const id=fields(signed).get(1);if(!id||!id.equals(createHash('sha256').update(pub).digest().subarray(0,16)))throw Error('CRX ID와 공개 키 불일치');
 const zip=crx.subarray(12+n);
 if(!verify('sha256',Buffer.concat([context,u32(signed.length),signed,zip]),{key:createPublicKey({key:pub,type:'spki',format:'der'}),padding:constants.RSA_PKCS1_PADDING},signature))throw Error('CRX 서명 검증 실패');
 const files=unzipSync(zip);const names=Object.keys(files).sort();
 if(JSON.stringify(names)!==JSON.stringify([...rules(profile).names].sort()))throw Error('허용되지 않은 패키지 파일');
 const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));rules(profile).check(manifest);
 if(manifest.key!==pub.toString('base64'))throw Error('manifest 공개 키 불일치');
 return {id:extensionId(pub),manifest,sha256:createHash('sha256').update(crx).digest('hex')};
}
export function makeSelfHost(files,privatePem,baseUrl,profile='diagnostic'){
 const base=httpsBase(baseUrl),pub=publicKey(privatePem),id=extensionId(pub);
 const manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));rules(profile).check(manifest);
 if(profile==='student'&&manifest.host_permissions[0]!==new URL(base).origin+'/*')throw Error('학생 빌드 서버와 배포 서버 원점 불일치');
 if(manifest.key&&manifest.key!==pub.toString('base64'))throw Error('빌드 공개 키와 서명 키가 다릅니다. 스토어 ID를 자체 키로 유지할 수 없습니다.');
 manifest.key=pub.toString('base64');manifest.update_url=base+'/updates.xml';
 const archive={...files,'manifest.json':new TextEncoder().encode(JSON.stringify(manifest,null,2))};
 const crx=packCrx3(zipSync(archive),privatePem);const inspected=inspectCrx3(crx,profile);
 const name=`${profile==='student'?'student-email-test':'classroom-pilot'}-${manifest.version}.crx`,codebase=base+'/'+name;
 const escape=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&apos;');
 const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n  <app appid="${id}"><updatecheck codebase="${escape(codebase)}" version="${manifest.version}" /></app>\n</gupdate>\n`;
 return {crx,xml,name,inputs:{distribution:'selfhost',extensionId:id,customUpdateUrl:manifest.update_url,crxUrl:codebase,version:manifest.version,sha256:inspected.sha256,externalHostingVerified:false,policyInstallVerified:false,deviceIdentityVerified:false,silentAuthVerified:false}};
}

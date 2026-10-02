import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createPublicKey,createHash,verify,constants} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,mkdtemp,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {assets,makeSelfHost,inspectCrx3,publicKey,extensionId,httpsBase,validId} from '../distribution-lib.mjs';
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({type:'pkcs8',format:'pem'});
const files=await assets(pathToFileURL(resolve('dist')+'/'));
// 형식 검증용 문자열. 실제 학교 URL로 확인하거나 접속하지 않음.
const base='https://distribution.goedu.kr/extensions/pilot';
test('자체 호스팅 HTTPS만 허용, 예시·인증정보·파일 URL 거부',()=>{
 for(const u of ['http://school.test/pilot','https://pilot.example.invalid','https://example.com/pilot','https://x.school.example/pilot','https://user:pass@school.test/pilot','https://school.test/pilot.zip','https://school.test/updates.xml','https://school.test/pilot?secret=x'])assert.throws(()=>httpsBase(u));
 assert.equal(httpsBase(base+'/'),base);assert.throws(()=>validId('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));assert.throws(()=>validId('fake-id'));
});
test('CRX3 실제 서명·ID·업데이트 XML·본문 manifest 일치 및 변조 거부',()=>{
 const r=makeSelfHost(files,pem,base);const inspected=inspectCrx3(r.crx);
 assert.equal(inspected.id,extensionId(publicKey(pem)));assert.equal(inspected.manifest.update_url,base+'/updates.xml');
 assert.match(r.xml,new RegExp('appid="'+inspected.id+'"'));assert.ok(r.xml.includes('codebase="'+r.inputs.crxUrl+'"'));assert.ok(r.xml.includes('version="'+inspected.manifest.version+'"'));
 const tampered=Buffer.from(r.crx);tampered[tampered.length-1]^=1;assert.throws(()=>inspectCrx3(tampered),/서명/);
 assert.throws(()=>inspectCrx3(Buffer.from('ZIP is not CRX')));
});
test('독립적인 CRX protobuf 파싱과 Node RSA 검증',()=>{
 const r=makeSelfHost(files,pem,base),crx=r.crx;
 const size=crx.readUInt32LE(8),header=crx.subarray(12,12+size);
 function parse(data){let p=0;const out={};const integer=()=>{let v=0,s=0,b;do{b=data[p++];v+=(b&127)*2**s;s+=7;}while(b&128);return v;};while(p<data.length){const tag=integer();const n=integer();out[tag>>3]=data.subarray(p,p+n);p+=n;}return out;}
 const h=parse(header),proof=parse(h[2]),signed=h[10000],zip=crx.subarray(12+size),length=Buffer.alloc(4);length.writeUInt32LE(signed.length);
 assert.ok(verify('RSA-SHA256',Buffer.concat([Buffer.from('CRX3 SignedData\0'),length,signed,zip]),{key:createPublicKey({key:proof[1],format:'der',type:'spki'}),padding:constants.RSA_PKCS1_PADDING},proof[2]));
 const actual=JSON.parse(new TextDecoder().decode(unzipSync(zip)['manifest.json']));assert.equal(actual.key,proof[1].toString('base64'));
 const expected=createHash('sha256').update(proof[1]).digest().subarray(0,16);assert.deepEqual(parse(signed)[1],expected);
});
test('같은 키는 같은 ID, 다른 키·스토어 공개 키 불일치 거부',()=>{
 assert.equal(makeSelfHost(files,pem,base).inputs.extensionId,makeSelfHost(files,pem,base).inputs.extensionId);
 const other=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 assert.notEqual(extensionId(publicKey(other)),extensionId(publicKey(pem)));
 const m=JSON.parse(new TextDecoder().decode(files['manifest.json']));m.key=publicKey(other).toString('base64');
 assert.throws(()=>makeSelfHost({...files,'manifest.json':new TextEncoder().encode(JSON.stringify(m))},pem,base),/서명 키/);
});
test('서명 도구에서 기록 수집 권한·추가 콘텐츠 코드·시험 외 manifest 거부',()=>{
 const m=JSON.parse(new TextDecoder().decode(files['manifest.json']));m.permissions.push('history');
 assert.throws(()=>makeSelfHost({...files,'manifest.json':new TextEncoder().encode(JSON.stringify(m))},pem,base),/시험 manifest/);
 const r=makeSelfHost(files,pem,base);assert.equal(r.inputs.externalHostingVerified,false);assert.equal(r.inputs.silentAuthVerified,false);
});
test('CLI: CRX·XML·입력 파일 생성, 서명 검사, 예시 URL·ID·키 덮어쓰기 거부',async()=>{
 const work=resolve('../../work');await mkdir(work,{recursive:true});const dir=await mkdtemp(work+'/distribution-tests-');
 assert.ok(dir.startsWith(work+'/')||dir.startsWith(work+'\\'));
 try{
  await cp(resolve('dist'),dir+'/dist',{recursive:true});await writeFile(dir+'/signing.pem',pem);
  const script=name=>resolve('scripts/'+name);
  const invoke=(name,args)=>spawnSync(process.execPath,[script(name),...args],{cwd:dir,encoding:'utf8'});
  const generated=invoke('selfhost.mjs',['--key',dir+'/signing.pem','--base-url',base]);assert.equal(generated.status,0,generated.stderr);
  const id=extensionId(publicKey(pem));const output=dir+'/release/selfhost/'+id;
  const keyInfo=invoke('key-info.mjs',[dir+'/signing.pem']);assert.equal(keyInfo.status,0);assert.equal(JSON.parse(keyInfo.stdout).extensionId,id);assert.equal(JSON.parse(keyInfo.stdout).privateKeyIncluded,false);
  const inputs=JSON.parse(await readFile(output+'/deployment-inputs.json','utf8'));assert.equal(inputs.extensionId,id);assert.equal(inputs.externalHostingVerified,false);
  const checked=invoke('verify-crx.mjs',[output+'/classroom-pilot-0.1.0.crx']);assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).signatureVerified,true);
  assert.notEqual(invoke('selfhost.mjs',['--key',dir+'/signing.pem','--base-url','https://distribution.school.example']).status,0);
  assert.notEqual(invoke('store-inputs.mjs',['--id','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']).status,0);
  await writeFile(dir+'/public.txt',publicKey(pem).toString('base64'));
  assert.equal(invoke('store-inputs.mjs',['--id',id,'--public-key-file',dir+'/public.txt']).status,0);
  const store=JSON.parse(await readFile(dir+'/release/webstore/deployment-inputs.json','utf8'));assert.equal(store.publicKeyMatches,true);assert.equal(store.storePublishedAndApproved,false);
  // 이미 있는 키를 교체하지 않는 생성기. 키 내용은 로그에 출력하지 않음.
  assert.notEqual(invoke('keygen.mjs',[dir+'/signing.pem']).status,0);assert.equal(await readFile(dir+'/signing.pem','utf8'),pem);
 }finally{
  // 삭제 대상을 검증한 작업용 임시 폴더로 제한.
  if(!dir.startsWith(work+'/')&&!dir.startsWith(work+'\\'))throw Error('잘못된 정리 경로');
  await rm(dir,{recursive:true,force:true});
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {assets,makeSelfHost,inspectCrx3} from '../../scripts/distribution-lib.mjs';
const pem=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const loaded=await assets(pathToFileURL(resolve('student-test-dist')+'/'),'student');
// Format fixture only; this hostname is not a verified deployment.
const base='https://distribution.goedu.kr/distribution';
const original=JSON.parse(new TextDecoder().decode(loaded['manifest.json']));
original.host_permissions=['https://distribution.goedu.kr/*'];delete original.key;
const change=manifest=>({...loaded,'manifest.json':new TextEncoder().encode(JSON.stringify(manifest))});
const files=change(original);
test('student CRX signature, exact files, XML ID/version and update URL agree',()=>{
 const r=makeSelfHost(files,pem,base,'student'),result=inspectCrx3(r.crx,'student');
 assert.equal(result.id,r.inputs.extensionId);
 assert.equal(result.manifest.update_url,r.inputs.customUpdateUrl);
 assert.ok(r.xml.includes(`appid="${result.id}"`));
 assert.ok(r.xml.includes(`version="${result.manifest.version}"`));
 assert.ok(r.xml.includes(`codebase="${r.inputs.crxUrl}"`));
 assert.equal(result.manifest.host_permissions[0],'https://distribution.goedu.kr/*');
 assert.equal(r.inputs.policyInstallVerified,false);
});
test('student package tampering and unexpected bundled files rejected',()=>{
 const r=makeSelfHost(files,pem,base,'student'),bad=Buffer.from(r.crx);bad[bad.length-1]^=1;
 assert.throws(()=>inspectCrx3(bad,'student'),/서명/);
 assert.throws(()=>makeSelfHost({...files,'private.pem':new Uint8Array([1])},pem,base,'student'),/패키지 파일/);
});
test('diagnostic signer continues rejecting student collection package',()=>{
 assert.throws(()=>makeSelfHost(files,pem,base),/manifest/);
 assert.throws(()=>inspectCrx3(makeSelfHost(files,pem,base,'student').crx));
});
test('student signing rejects extra permissions, OAuth, host mismatch and example URL',()=>{
 for(const m of [{...original,permissions:[...original.permissions,'history']},{...original,oauth2:{client_id:'fake'}},{...original,content_scripts:[{}]},{...original,host_permissions:['https://another.goedu.kr/*']}]){
  assert.throws(()=>makeSelfHost(change(m),pem,base,'student'));
 }
 assert.throws(()=>makeSelfHost(files,pem,'https://pilot.example.invalid/distribution','student'));
});

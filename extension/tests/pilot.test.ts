import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {config,schoolAccount,deviceStatus,ensureAlarm,labels,retryDelay,payload} from '../src/core.ts';
const raw={serverUrl:'https://pilot.example.invalid',schoolId:'school-pilot',testEnabled:true,devicePolicy:'allowlist',allowedDeviceIds:['directory-1']};
const hosts=['https://pilot.example.invalid/*'];
test('managed 누락·오류·원점 불일치·빈 allowlist 거부 및 기본 5분',()=>{
 for(const r of [{},{...raw,serverUrl:'http://localhost'},{...raw,schoolId:''},{...raw,intervalMinutes:0},{...raw,testEnabled:'true'},{...raw,allowedDeviceIds:[]},{...raw,serverUrl:'https://else.invalid'}]) assert.throws(()=>config(r,hosts));
 assert.equal(config(raw,hosts).intervalMinutes,5);
});
test('학교 계정 및 기기 정보 빈 값 정상 금지',()=>{
 assert.equal(schoolAccount({email:'',id:''}),false);
 assert.equal(schoolAccount({email:'a@goedu.kr',id:''}),false);
 assert.equal(schoolAccount({email:'a@goedu.kr',id:'real'}),true);
 const c=config(raw,hosts);
 for(const [p,i,d] of [['win','admin','directory-1'],['cros','development','directory-1'],['cros','admin','']]) assert.equal(deviceStatus(p,i,d,c),'needs_check');
 assert.equal(deviceStatus('cros','admin','directory-1',c),'confirmed');
});
test('알람 중복 방지·재생성 및 재시도 상한',async()=>{
 let existing:any;let calls=0;
 const api={get:async()=>existing,create:async(_n:string,a:any)=>{existing=a;calls++;}};
 await ensureAlarm(api,5);await ensureAlarm(api,5);assert.equal(calls,1);
 existing=undefined;await ensureAlarm(api,5);assert.equal(calls,2);
 assert.equal(retryDelay(5,1),600000);assert.equal(retryDelay(5,100),3600000);
});
test('manifest에 방문·검색·콘텐츠 수집 권한 없음',()=>{
 const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
 assert.deepEqual(m.permissions,['identity','identity.email','enterprise.deviceAttributes','storage','alarms']);
 assert.equal(m.content_scripts,undefined);assert.equal(m.permissions.includes('management'),false);
});

// 배포되는 worker 코드를 그대로 실행. Chrome 및 네트워크만 대체한다.
let local:any={},managed:any=raw,profile:any={email:'student@goedu.kr',id:'google-id'};
let authError=false,device:any,requests:any[]=[],httpStatus=200,alarm:any,alarmCreates=0,removed=0;
const listener={addListener:()=>{}};
const chromeMock:any={
 storage:{local:{get:async()=>local,set:async(v:any)=>{local={...local,...v};}},managed:{get:async()=>managed},onChanged:listener},
 runtime:{getManifest:()=>({version:'0.1.0',host_permissions:hosts,oauth2:{client_id:'test.apps.googleusercontent.com'}}),getPlatformInfo:async()=>({os:'cros'}),onInstalled:listener,onStartup:listener},
 identity:{AccountStatus:{ANY:'ANY'},getProfileUserInfo:async(options:any)=>{assert.equal(options.accountStatus,'ANY');return profile;},getAuthToken:async(options:any)=>{assert.equal(options.interactive,false);assert.equal(options.account.id,profile.id);if(authError) throw Error('OAuth consent required');return {token:'mock-token'};},removeCachedAuthToken:async()=>{removed++;},onSignInChanged:listener},
 management:{getSelf:async()=>({installType:'admin'})},
 enterprise:{deviceAttributes:{getDirectoryDeviceId:async()=>device}},
 alarms:{get:async()=>alarm,create:async(_n:string,a:any)=>{alarm=a;alarmCreates++;},onAlarm:listener}
};
(globalThis as any).chrome=chromeMock;
globalThis.fetch=async(url:any,options:any)=>{requests.push({url:String(url),options});return new Response(JSON.stringify(String(url).endsWith('/probe')?{email:profile.email}:{device_state:'confirmed'}),{status:httpStatus});};
const {tick}=await import('../../dist/worker.js');
await tick('worker_restart');
function reset(){local={};managed=raw;profile={email:'student@goedu.kr',id:'google-id'};authError=false;device='directory-1';requests=[];httpStatus=200;alarm=undefined;alarmCreates=0;chromeMock.enterprise={deviceAttributes:{getDirectoryDeviceId:async()=>device}};}
test('worker: managed 미설정·계정 빈 값 안전 대기 및 API 부재·빈 값',async()=>{
 reset();managed={};await tick('startup');assert.match(local.diagnostic.overall,/관리 설정 오류/);assert.equal(requests.length,0);
 reset();profile={email:'',id:''};await tick('startup');assert.equal(local.diagnostic.account,labels.account_missing);assert.equal(requests.length,0);
 reset();chromeMock.enterprise=undefined;await tick('startup');assert.equal(local.diagnostic.device,labels.needs_check);assert.equal(requests.length,0);
 reset();device='';await tick('startup');assert.equal(local.diagnostic.deviceId,'');assert.notEqual(local.diagnostic.overall,labels.healthy);
});
test('worker: 비대화형 인증 실패는 POST·창 없이 대기',async()=>{
 reset();authError=true;await tick('installed');assert.match(local.diagnostic.error,/OAuth consent required/);assert.equal(requests.length,0);assert.equal(local.diagnostic.auth,labels.auth_needed);
});
test('worker: 서버 오류·backoff 영속화·401 토큰 제거·복구',async()=>{
 reset();httpStatus=500;await tick('startup');assert.equal(local.diagnostic.auth,labels.connection_failed);assert.equal(local.diagnostic.failures,1);
 const count=requests.length;await tick('alarm');assert.equal(requests.length,count);assert.equal(local.diagnostic.overall,'재시도 대기');
 local.diagnostic.nextAttempt=0;httpStatus=401;await tick('alarm');assert.equal(removed,1);assert.equal(local.diagnostic.auth,labels.auth_needed);
 local.diagnostic.nextAttempt=0;httpStatus=200;await tick('alarm');assert.equal(local.diagnostic.overall,labels.healthy);assert.equal(local.diagnostic.failures,0);
 assert.equal(JSON.parse(requests.at(-1).options.body).recent_error,'previous_attempt_failed');
});
test('worker: 동시 이벤트 병합, 인증 probe 다음 상태 전송, 학생 이메일 본문 제외',async()=>{
 reset();await Promise.all([tick('startup'),tick('alarm'),tick('worker_restart')]);assert.equal(requests.length,2);assert.equal(alarmCreates,1);
 assert.equal(requests[0].options.body,undefined);assert.match(requests[0].url,/probe$/);
 const body=JSON.parse(requests[1].options.body);
 assert.deepEqual(Object.keys(body).sort(),['school_id','device_id','device_state','install_type','platform','extension_version','trigger','interval_minutes','recent_error'].sort());
 assert.equal(body.email,undefined);assert.equal(body.url,undefined);assert.equal(body.search,undefined);
});
test('worker: diagnostic 기기 미확인으로 인증·전송해도 정상 표시 금지',async()=>{
 reset();managed={...raw,devicePolicy:'diagnostic',allowedDeviceIds:[]};device='';await tick('startup');assert.equal(requests.length,2);assert.notEqual(local.diagnostic.overall,labels.healthy);assert.equal(JSON.parse(requests[1].options.body).device_id,null);
});
test('worker: 인터넷 끊김·복구 및 인증 계정 불일치',async()=>{
 reset();const normalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 await tick('alarm');assert.equal(local.diagnostic.overall,labels.connection_failed);assert.equal(local.diagnostic.lastConnected,undefined);
 globalThis.fetch=normalFetch;local.diagnostic.nextAttempt=0;await tick('alarm');assert.equal(local.diagnostic.overall,labels.healthy);
 reset();globalThis.fetch=async(url:any,options:any)=>{requests.push({url,options});return new Response(JSON.stringify({email:'other@goedu.kr'}));};
 await tick('startup');assert.equal(requests.length,1);assert.match(local.diagnostic.error,/프로필 불일치/);assert.equal(local.diagnostic.auth,labels.auth_needed);
 globalThis.fetch=normalFetch;
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {unzipSync} from 'fflate';
let stored:any={};let raw:any;let email='pilot-a@goedu.kr';let device='directory-test';let platform='cros';let install='admin';let fail=false;let authCalls=0;let requests:any[]=[];
let window:any;const alarms=new Map();const listen={addListener:()=>{}};
function reset(){stored={};email='pilot-a@goedu.kr';device='directory-test';platform='cros';install='admin';fail=false;requests=[];alarms.clear();raw={serverUrl:'https://pilot.example.invalid',schoolId:'school-pilot',testEnabled:true,intervalMinutes:5,devicePolicy:'allowlist',allowedDeviceIds:['directory-test']};window={active:true,window_id:'00000000-0000-4000-8000-000000000000',starts_at:Date.now()-1000,ends_at:Date.now()+599000};}
reset();
(globalThis as any).chrome={storage:{managed:{get:async()=>raw},session:{get:async()=>stored,set:async(v:any)=>{Object.assign(stored,v);}},onChanged:listen},identity:{AccountStatus:{ANY:'ANY'},getProfileUserInfo:async()=>({email,id:email?'primary-profile-id':''}),getAuthToken:async()=>{authCalls++;throw Error('OAuth must not run');},onSignInChanged:listen},enterprise:{deviceAttributes:{getDirectoryDeviceId:async()=>device}},management:{getSelf:async()=>({installType:install})},runtime:{id:'fixture',getManifest:()=>({version:'0.2.2',host_permissions:['https://pilot.example.invalid/*']}),getPlatformInfo:async()=>({os:platform}),getURL:(p:string)=>'chrome-extension://fixture/'+p,onInstalled:listen,onStartup:listen,onMessage:listen},alarms:{clear:async(n:string)=>alarms.delete(n),get:async(n:string)=>alarms.get(n),create:async(n:string,v:any)=>{alarms.set(n,v);},onAlarm:listen},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},webNavigation:{onCommitted:listen,onHistoryStateUpdated:listen}};
globalThis.fetch=async(url:any,options:any)=>{requests.push({url:String(url),options});if(fail)return new Response('{}',{status:500});const body=options.body?JSON.parse(options.body):{};const result=String(url).endsWith('/window')?window:String(url).endsWith('/events')?{accepted_ids:body.events.map((e:any)=>e.id),student_authenticated:false}:{accepted:true,student_authenticated:false};return new Response(JSON.stringify(result));};
const worker=await import('../../student-test-dist/student-test/src/worker.js');await worker.tick();
test('학생 ZIP: OAuth·공유 키 없음, 서버 원점 제한·투명한 수집 권한',()=>{
 const files=unzipSync(fs.readFileSync('student-email-test-0.2.2.zip'));const m=JSON.parse(new TextDecoder().decode(files['manifest.json']));
 assert.equal(m.oauth2,undefined);assert.ok(m.permissions.includes('identity.email'));assert.ok(m.permissions.includes('webNavigation'));assert.ok(!m.permissions.includes('history'));assert.deepEqual(m.host_permissions,[(process.env.PILOT_SERVER_ORIGIN||'https://pilot.example.invalid')+'/*']);assert.ok(files[m.background.service_worker]);assert.equal(m.incognito,'not_allowed');
});
test('managed 누락·학교 프로필 없음: 대기, 이메일/탐색 전송 안 함',async()=>{
 reset();raw={};await worker.tick('managed_change');assert.equal(requests.length,0);assert.equal(stored.schoolEmailTest.window.active,false);
 reset();email='';await worker.tick();await worker.navigation({url:'https://www.google.com/search?q=not-collected',frameId:0},'visit');assert.equal(requests.length,0);assert.equal(stored.schoolEmailTest.events.length,0);
});
test('기기 빈 값·API 없음·개발자 PC: 상태만 전송하고 수집 안 함',async()=>{
 for(const choice of ['empty','absent','desktop','unpacked']){
  reset();raw.devicePolicy='diagnostic';
  if(choice==='empty')device='';if(choice==='absent')(globalThis as any).chrome.enterprise=undefined;if(choice==='desktop')platform='win';if(choice==='unpacked')install='development';
  await worker.tick();await worker.navigation({url:'https://www.google.com/search?q=not-collected',frameId:0},'visit');assert.equal(stored.schoolEmailTest.window.active,false);assert.equal(stored.schoolEmailTest.events.length,0);assert.ok(!requests.some(r=>r.url.endsWith('/events')));
  (globalThis as any).chrome.enterprise={deviceAttributes:{getDirectoryDeviceId:async()=>device}};
 }
});
test('이메일 시험: 인증 우회 토큰 없이 전송, URL 정리·검색어·수신 확인',async()=>{
 reset();await worker.tick();assert.equal(stored.schoolEmailTest.window.active,true);
 await worker.navigation({url:'https://www.google.com/search?q=정보+시험&token=remove#remove',frameId:0},'visit');
 assert.equal(authCalls,0);assert.equal(stored.schoolEmailTest.sent,1);
 const r=requests.find(r=>r.url.endsWith('/events'));const data=JSON.parse(r.options.body);
 assert.equal(r.options.headers.Authorization,undefined);assert.equal(data.email,'pilot-a@goedu.kr');assert.equal(data.events[0].url,'https://www.google.com/search');assert.equal(data.events[0].search,'정보 시험');assert.ok(!JSON.stringify(data).includes('remove'));
});
test('서버에서 교사 중지·시험 만료·iframe: 새 기록 없음',async()=>{
 reset();await worker.tick();await worker.navigation({url:'https://site.test',frameId:2},'visit');assert.equal(stored.schoolEmailTest.events.length,0);
 window={active:false};await worker.navigation({url:'https://site.test/stop',frameId:0},'visit');assert.equal(stored.schoolEmailTest.events.length,0);
 reset();await worker.tick();stored.schoolEmailTest.window.ends_at=Date.now()-1;await worker.navigation({url:'https://site.test/expired',frameId:0},'visit');assert.equal(stored.schoolEmailTest.events.length,0);
});
test('서버 오류: 빠른 반복 없음·수집 중지·알람 하나·계정 변경 시 이전 큐 제거',async()=>{
 reset();fail=true;await worker.tick();const count=requests.length;await worker.tick();assert.equal(requests.length,count);assert.equal(stored.schoolEmailTest.window.active,false);assert.ok(stored.schoolEmailTest.nextAttempt>Date.now());assert.equal(alarms.size,1);
 reset();await worker.tick();await worker.navigation({url:'https://site.test/a',frameId:0},'visit');email='pilot-b@goedu.kr';await worker.navigation({url:'https://site.test/b',frameId:0},'visit');assert.equal(stored.schoolEmailTest.events.length,0);assert.equal(stored.schoolEmailTest.window.active,false);
});
test('ON/OFF mode continues beyond 10 minutes and 200 events with a bounded queue',async()=>{
 reset();window={...window,starts_at:Date.now()-3600000,ends_at:null,mode:'on-off'};
 await worker.tick();assert.equal(stored.schoolEmailTest.window.active,true);
 assert.equal(alarms.has('school-email-stop'),false);
 for(let i=0;i<205;i++)await worker.navigation({url:'https://site.test/page/'+i,frameId:0},'visit');
 assert.equal(stored.schoolEmailTest.sent,205);assert.equal(stored.schoolEmailTest.recorded,205);
 assert.equal(stored.schoolEmailTest.events.length,0);assert.equal(stored.schoolEmailTest.uploaded.length,0);
 window={active:false};const prior=requests.filter(r=>r.url.endsWith('/events')).length;
 await worker.navigation({url:'https://site.test/off',frameId:0},'visit');
 assert.equal(requests.filter(r=>r.url.endsWith('/events')).length,prior);
 assert.equal(stored.schoolEmailTest.window.active,false);
});
test('missing ON/OFF marker does not allow an unbounded collection window',async()=>{
 reset();window={...window,ends_at:null};await worker.tick();
 assert.equal(stored.schoolEmailTest.window.active,false);
 await worker.navigation({url:'https://site.test/no-mode',frameId:0},'visit');
 assert.ok(!requests.some(r=>r.url.endsWith('/events')));
});
test('policy mode collects on all admin-installed devices without Directory ID',async()=>{
 for(const os of ['cros','win','mac']){
  reset();raw.devicePolicy='policy';raw.allowedDeviceIds=[];device='';platform=os;
  window={...window,ends_at:null,mode:'on-off'};(globalThis as any).chrome.enterprise=undefined;
  await worker.tick();await worker.navigation({url:'https://site.test/policy/'+os,frameId:0},'visit');
  assert.equal(stored.schoolEmailTest.sent,1);assert.equal(stored.schoolEmailTest.deviceId,'');
 }
 (globalThis as any).chrome.enterprise={deviceAttributes:{getDirectoryDeviceId:async()=>device}};
 reset();raw.devicePolicy='policy';raw.allowedDeviceIds=[];install='development';
 await worker.tick();await worker.navigation({url:'https://site.test/manual',frameId:0},'visit');
 assert.ok(!requests.some(r=>r.url.endsWith('/events')));
});

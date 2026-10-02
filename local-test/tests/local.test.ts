import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {start,empty,append,DURATION,LIMIT,parseVisit} from '../src/core.ts';
test('시작 전·종료 후·서브프레임·prerender는 수집하지 않음',()=>{
 const event={url:'https://example.org/page',frameId:0};
 assert.equal(append(empty(),event,1000,'visit').events.length,0);
 const s=start(1000);assert.equal(append(s,event,1000+DURATION,'visit').events.length,0);
 assert.equal(append(s,{...event,frameId:2},2000,'visit').events.length,0);
 assert.equal(append(s,{...event,documentLifecycle:'prerender'},2000,'visit').events.length,0);
});
test('일반 URL 민감 쿼리·fragment 제거, 정확한 검색 도메인만 추출',()=>{
 assert.equal(parseVisit('https://example.org/a?token=secret#x',10,'visit')?.url,'https://example.org/a');
 assert.equal(parseVisit('https://www.google.com/search?q=chromebook+test&secret=x',10,'visit')?.search,'chromebook test');
 assert.equal(parseVisit('https://search.naver.com/search.naver?query=정보+수업',10,'visit')?.search,'정보 수업');
 assert.equal(parseVisit('https://www.google.com.evil.test/search?q=private',10,'visit')?.search,null);
 for(const url of ['chrome://extensions','file:///private.txt','data:text/html,secret','https://user:pass@example.org'])assert.equal(parseVisit(url,10,'visit'),null);
});
test('중복 이벤트 제외·최대 200건·본문/이메일/기기 정보 없음',()=>{
 let s=start(1000);const event={url:'https://example.org/a',frameId:0};s=append(s,event,2000,'visit');
 assert.equal(append(s,event,2200,'spa').events.length,1);
 for(let i=1;i<201;i++)s=append(s,{...event,url:'https://example.org/'+i},2000+i,'visit');
 assert.equal(s.events.length,LIMIT);assert.equal(s.dropped,1);
 assert.deepEqual(Object.keys(s.events[0]).sort(),['id','at','url','search','kind'].sort());
});
test('로컬 시험 manifest: optional webNavigation, loopback만, 시크릿 제외',()=>{
 const m=JSON.parse(fs.readFileSync('local-test-dist/manifest.json','utf8'));
 assert.deepEqual(m.permissions,['storage','alarms']);assert.deepEqual(m.optional_permissions,['webNavigation']);
 assert.deepEqual(m.optional_host_permissions,['http://127.0.0.1:8765/*']);assert.equal(m.incognito,'not_allowed');assert.equal(m.content_scripts,undefined);
});
let stored:any={};let permission=true;let install='development';let requests:any[]=[];let status=200;const alarms=new Map();
const listen={addListener:()=>{}};
(globalThis as any).chrome={storage:{session:{get:async()=>stored,set:async(v:any)=>{stored=v;}}},management:{getSelf:async()=>({installType:install})},permissions:{contains:async()=>permission,onAdded:listen,onRemoved:listen},webNavigation:{onCommitted:listen,onHistoryStateUpdated:listen},alarms:{create:async(n:string,v:any)=>{alarms.set(n,v);},get:async(n:string)=>alarms.get(n),clear:async(n:string)=>alarms.delete(n),onAlarm:listen},runtime:{id:'test-extension',getURL:(p:string)=>'chrome-extension://test-extension/'+p,onInstalled:listen,onStartup:listen,onMessage:listen}};
globalThis.fetch=async(url:any,options:any)=>{requests.push({url,options});return new Response(JSON.stringify(String(url).endsWith('/probe')?{run_id:'teacher-test-run'}:{run_id:'teacher-test-run',accepted_ids:JSON.parse(options.body).events.map((e:any)=>e.id)}),{status});};
const {command,navigation,retry}=await import('../../local-test-dist/worker.js');await command('clear');
const auth=()=>({token:'per-session-token',runId:'teacher-test-run',expiresAt:Date.now()+DURATION});
test('worker: 서버 인증 전·권한 없음·정책 설치에서 수집 시작 거부',async()=>{
 await command('clear');await assert.rejects(command('start'),/인증/);
 permission=false;await assert.rejects(command('start',auth()),/권한/);permission=true;
 install='admin';await assert.rejects(command('start',auth()),/학생 정책 배포/);install='development';
 assert.equal(stored.localTest.running,false);assert.equal(stored.localTest.events.length,0);
});
test('worker: 실제 이벤트 경로와 POST DTO·서버 수신 확인·중지',async()=>{
 requests=[];status=200;await command('start',auth());
 await navigation({url:'https://www.google.com/search?q=chromebook+test&secret=remove',frameId:0},'visit');
 assert.equal(stored.localTest.events.length,1);assert.equal(stored.localTest.uploaded.length,1);
 const body=JSON.parse(requests.at(-1).options.body);assert.deepEqual(Object.keys(body),['events']);assert.equal(body.events[0].search,'chromebook test');assert.equal(body.events[0].url,'https://www.google.com/search');
 await command('stop');const count=requests.length;await navigation({url:'https://example.org',frameId:0},'visit');assert.equal(requests.length,count);assert.equal(stored.localTest.token,null);
});
test('worker: 서버 장애 backoff·재연결 및 worker 재시작 알람 복구',async()=>{
 await command('clear');status=200;await command('start',auth());status=500;
 await navigation({url:'https://example.org/error',frameId:0},'visit');assert.equal(stored.localTest.failures,1);assert.equal(stored.localTest.uploaded.length,0);
 const count=requests.length;await retry();assert.equal(requests.length,count);
 stored.localTest.nextRetry=0;status=200;await retry();assert.equal(stored.localTest.uploaded.length,1);
 alarms.clear();await command('read');assert.equal(alarms.size,2);
 stored.localTest.endsAt=Date.now()-1;await command('read');assert.equal(stored.localTest.running,false);assert.equal(stored.localTest.token,null);
});

// 실제 HTTP를 사용하되 Chrome 탐색 이벤트만 모의. 인증 토큰은 stdin으로만 받는다.
import assert from 'node:assert/strict';
let input='';for await(const part of process.stdin)input+=part;
const auth=JSON.parse(input);input='';
let state={};const listen={addListener:()=>{}};const alarms=new Map();
globalThis.chrome={storage:{session:{get:async()=>state,set:async(v)=>{state=v;}}},management:{getSelf:async()=>({installType:'development'})},permissions:{contains:async()=>true,onAdded:listen,onRemoved:listen},webNavigation:{onCommitted:listen,onHistoryStateUpdated:listen},alarms:{create:async(n,v)=>alarms.set(n,v),get:async n=>alarms.get(n),clear:async n=>alarms.delete(n),onAlarm:listen},runtime:{id:'smoke-test',getURL:p=>'chrome-extension://smoke-test/'+p,onInstalled:listen,onStartup:listen,onMessage:listen}};
const {command,navigation}=await import('../local-test-dist/worker.js');
await command('start',auth);
await navigation({url:'https://www.google.com/search?q=teacher+synthetic+test&private=removed',frameId:0,documentLifecycle:'active'},'visit');
await navigation({url:'https://www.wikipedia.org/?token=removed',frameId:0,documentLifecycle:'active'},'visit');
assert.equal(state.localTest.events.length,2);assert.equal(state.localTest.uploaded.length,2);
await command('stop');assert.equal(state.localTest.token,null);
console.log('worker -> real HTTP: 2 synthetic events acknowledged; stop cleared token');

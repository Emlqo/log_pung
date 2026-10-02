import {append,empty,expire,start,type Session} from './core.js';
const ALARM='teacher-local-test-stop';
const RETRY='teacher-local-test-upload';
const SERVER='http://127.0.0.1:8765';
let pending:Promise<unknown>=Promise.resolve();
function serial<T>(job:()=>Promise<T>):Promise<T>{const next=pending.then(job,job);pending=next.catch(()=>undefined);return next;}
async function read():Promise<Session>{return (await chrome.storage.session.get('localTest')).localTest as Session||empty();}
async function save(s:Session){
 await chrome.storage.session.set({localTest:s});
 if(chrome.action){await chrome.action.setBadgeText({text:s.running?'시험':''});await chrome.action.setBadgeBackgroundColor({color:'#bb6600'});await chrome.action.setTitle({title:s.running?'본인 Chrome 수집 시험 실행 중 · 아이콘에서 중지 가능':'교사용 로컬 수집 시험 · 수집 중지'});}
 return s;
}
export async function command(action:string,auth?:{token:string;runId:string;expiresAt:number}):Promise<Session>{return serial(async()=>{
 let s=expire(await read(),Date.now());
 if(action==='start'){
  if((await chrome.management.getSelf()).installType!=='development')throw Error('이 프로그램은 개발자 PC의 unpacked 로컬 시험 전용입니다. 학생 정책 배포를 지원하지 않습니다.');
  if(!await chrome.permissions.contains({permissions:['webNavigation'],origins:[SERVER+'/*']}))throw Error('방문 상태·로컬 시험 서버 접근 권한이 승인되지 않았습니다.');
  if(!auth?.token||!auth.runId||!Number.isFinite(auth.expiresAt)||auth.expiresAt<=Date.now())throw Error('교사 로컬 시험 서버 인증이 필요합니다.');
  const response=await fetch(SERVER+'/api/local/probe',{headers:{Authorization:'Bearer '+auth.token},signal:AbortSignal.timeout(5000),redirect:'error',credentials:'omit'});
  if(!response.ok)throw Error('시험 서버 인증 확인 실패 HTTP '+response.status);
  const checked=await response.json();if(checked.run_id!==auth.runId)throw Error('시험 세션 불일치');
  register();s={...start(Date.now()),token:auth.token,runId:auth.runId,endsAt:Math.min(Date.now()+600000,auth.expiresAt)};await chrome.alarms.create(ALARM,{when:s.endsAt!});
  await chrome.alarms.create(RETRY,{periodInMinutes:1});
 }else if(action==='stop'){
  s={...s,running:false,token:null,stoppedReason:'직접 중지 · 이후 전송도 중지'};await chrome.alarms.clear(ALARM);await chrome.alarms.clear(RETRY);
 }else if(action==='clear'){
  s=empty();await chrome.alarms.clear(ALARM);await chrome.alarms.clear(RETRY);
 }else if(action!=='read')throw Error('지원하지 않는 명령');
 if(!s.running){s.token=null;await chrome.alarms.clear(RETRY);}
 else {
  if(!await chrome.alarms.get(ALARM))await chrome.alarms.create(ALARM,{when:s.endsAt!});
  if(!await chrome.alarms.get(RETRY))await chrome.alarms.create(RETRY,{periodInMinutes:1});
 }
 return save(s);
});}
async function upload(s:Session):Promise<Session>{
 s=expire(s,Date.now());if(!s.running||!s.token)return {...s,token:s.running?s.token:null};
 const batch=s.events.filter(e=>!s.uploaded.includes(e.id)).slice(0,20);if(!batch.length||Date.now()<s.nextRetry)return s;
 try{
  const response=await fetch(SERVER+'/api/local/events',{method:'POST',headers:{Authorization:'Bearer '+s.token,'Content-Type':'application/json'},body:JSON.stringify({events:batch}),signal:AbortSignal.timeout(5000),redirect:'error',credentials:'omit',cache:'no-store'});
  if(!response.ok){if(response.status===401||response.status===403)return {...s,running:false,token:null,error:'시험 인증 만료·거부 HTTP '+response.status,stoppedReason:'인증 오류로 중지'};throw Error('HTTP '+response.status);}
  const accepted=await response.json();
  if(accepted.run_id!==s.runId||!Array.isArray(accepted.accepted_ids)||batch.some(e=>!accepted.accepted_ids.includes(e.id)))throw Error('서버 수신 확인 응답 불일치');
  return {...s,uploaded:[...s.uploaded,...batch.map(e=>e.id)],lastUploaded:Date.now(),failures:0,nextRetry:0,error:''};
 }catch(e){const failures=s.failures+1;return {...s,failures,nextRetry:Date.now()+Math.min(8,2**Math.min(failures-1,3))*60000,error:'전송 실패 · 재시도 대기: '+String(e)};}
}
export async function retry(){return serial(async()=>save(await upload(await read())));}
export async function navigation(event:{url:string;frameId:number;documentLifecycle?:string},kind:'visit'|'spa'){return serial(async()=>save(await upload(append(await read(),event,Date.now(),kind))));}
let registered=false;
function register(){if(registered||!chrome.webNavigation?.onCommitted)return;registered=true;
 chrome.webNavigation.onCommitted.addListener(e=>{void navigation(e,'visit');});
 chrome.webNavigation.onHistoryStateUpdated.addListener(e=>{void navigation(e,'spa');});
}
register();
chrome.permissions.onAdded.addListener(()=>{register();});
chrome.permissions.onRemoved.addListener(()=>{void serial(async()=>{const s=await read();return save({...s,running:false,token:null,stoppedReason:'권한 제거로 중지'});});});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)void command('read');else if(a.name===RETRY)void retry();});
chrome.runtime.onInstalled.addListener(()=>{void command('clear');});
chrome.runtime.onStartup.addListener(()=>{void command('clear');});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return false;
 if(typeof message?.action!=='string')return false;
 void command(message.action,message.auth).then(s=>{const {token,...safe}=s;reply({ok:true,session:safe});},e=>reply({ok:false,error:String(e)}));return true;
});
// worker 재시작 시 기간 검사. 브라우저 재시작/확장 재로드 시 메모리 저장소가 초기화됨.
void command('read');

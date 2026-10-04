import {config,deviceStatus,ensureAlarm,retryDelay,schoolAccount,payload,ALARM,type Config as BaseConfig} from '../../extension/src/core.js';
import {parseVisit,type Visit} from '../../local-test/src/core.js';
type Config=Omit<BaseConfig,'devicePolicy'> & {devicePolicy:BaseConfig['devicePolicy']|'policy'};
type Window={active:boolean;window_id?:string;starts_at?:number;ends_at?:number|null;mode?:string};
export type State={email:string;deviceId:string;platform:string;install:string;deviceState:string;version:string;lastConnected:number;nextAttempt:number;failures:number;error:string;status:string;devicePolicy?:string;window:Window;events:Visit[];uploaded:string[];recorded?:number;sent?:number;lastVisit?:Visit;};
function ongoing(w:Window){return w.mode==='on-off'&&w.ends_at===null;}
function active(w:Window){return w.active&&!!w.starts_at&&Date.now()>=w.starts_at&&(ongoing(w)||(!!w.ends_at&&Date.now()<w.ends_at));}
const KEY='schoolEmailTest';
function empty():State{return {email:'',deviceId:'',platform:'',install:'',deviceState:'needs_check',version:chrome.runtime.getManifest().version,lastConnected:0,nextAttempt:0,failures:0,error:'',status:'설정 확인·대기',window:{active:false},events:[],uploaded:[]};}
let pending:Promise<unknown>=Promise.resolve();
function serial<T>(job:()=>Promise<T>){const r=pending.then(job,job);pending=r.catch(()=>undefined);return r;}
async function state():Promise<State>{return (await chrome.storage.session.get(KEY))[KEY] as State|undefined||empty();}
async function save(s:State){
 const collecting=active(s.window);
 await chrome.storage.session.set({[KEY]:s});
 await chrome.action.setBadgeText({text:collecting?'ON':''});
 await chrome.action.setBadgeBackgroundColor({color:'#bb6600'});
 const name=chrome.runtime.getManifest().name||'풍양중학교 수업 활동 기록 및 보안프로그램';
 await chrome.action.setTitle({title:name+' · '+(collecting?'수집 ON':'수집 OFF 또는 대기')});
 return s;
}
async function settings():Promise<Config>{const raw=await chrome.storage.managed.get(null);const policy=raw.devicePolicy==='policy';const c=config(policy?{...raw,devicePolicy:'diagnostic'}:raw,chrome.runtime.getManifest().host_permissions||[]);return {...c,devicePolicy:policy?'policy':c.devicePolicy};}
async function request(c:Config,path:string,body?:unknown){
 const r=await fetch(c.serverUrl+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),redirect:'error',credentials:'omit',cache:'no-store'});
 if(!r.ok)throw Error('서버 HTTP '+r.status);
 return r.json();
}
function report(c:Config,s:State,trigger='alarm'){
 return {...payload({...c,devicePolicy:c.devicePolicy==='policy'?'diagnostic':c.devicePolicy},{deviceId:s.deviceId,deviceState:s.deviceState,platform:s.platform,installType:s.install,version:s.version,trigger,previousFailed:s.failures>0}),email:s.email};
}
async function profile(s:State,c:Config){
 const p=await chrome.identity.getProfileUserInfo({accountStatus:chrome.identity.AccountStatus.ANY});
 if(!schoolAccount(p))throw Error('계정 정보 확인 불가: 학교 Chrome 프로필 필요');
 if(s.email&&s.email.toLowerCase()!==p.email.toLowerCase())s=empty();
 s.email=p.email.toLowerCase();s.platform=(await chrome.runtime.getPlatformInfo()).os;s.install=(await chrome.management.getSelf()).installType;
 try{s.deviceId=await chrome.enterprise?.deviceAttributes?.getDirectoryDeviceId()||'';}catch{s.deviceId='';}
 s.devicePolicy=c.devicePolicy;s.deviceState=c.devicePolicy==='policy'?(s.install==='admin'?'confirmed':'needs_check'):deviceStatus(s.platform,s.install,s.deviceId,{...c,devicePolicy:c.devicePolicy});
 return s;
}
async function refresh(trigger:string){
 let s=await state();let c:Config|undefined;
 if(['managed_change','account_change','installed'].includes(trigger))s.nextAttempt=0;
 try{
  c=await settings();await ensureAlarm(chrome.alarms,c.intervalMinutes);
  if(!c.testEnabled){s={...empty(),status:'관리자 시험 비활성·수집 없음'};return save(s);}
  s=await profile(s,c);
  if(Date.now()<s.nextAttempt){s.window={active:false};s.status='서버 재시도 대기 · 수집 없음';return save(s);}
  const accepted=await request(c,'/api/student/status',report(c,s,trigger));
  if(accepted.student_authenticated!==false)throw Error('서버 시험 모드 불일치');
  const w=await request(c,'/api/student/window') as Window;
  if(w.active&&(!w.window_id||!w.starts_at||w.starts_at>Date.now()+5000||(!ongoing(w)&&(!w.ends_at||w.ends_at-w.starts_at>600000||Date.now()>=w.ends_at))))throw Error('서버 수집 상태 오류');
  if(s.window.window_id!==w.window_id){s.events=[];s.uploaded=[];s.recorded=0;s.sent=0;s.lastVisit=undefined;}
  s.window=s.deviceState==='confirmed'&&(c.devicePolicy==='allowlist'||c.devicePolicy==='policy')?w:{active:false};
  s.status=s.window.active?'방문·검색 수집 ON · 이메일 인증 없음':s.deviceState==='confirmed'?'수집 OFF 또는 교사 시작 대기':'학교 기기 확인 필요 · 수집 없음';
  if(active(s.window)&&s.window.ends_at)await chrome.alarms.create('school-email-stop',{when:s.window.ends_at});
  else await chrome.alarms.clear('school-email-stop');
  s.lastConnected=Date.now();s.failures=0;s.nextAttempt=0;s.error='';
 }catch(e){s.window={active:false};s.error=String(e).slice(0,400);s.status='오류·안전 대기 · 수집 없음';s.failures++;s.nextAttempt=Date.now()+retryDelay(c?.intervalMinutes||5,s.failures);await ensureAlarm(chrome.alarms,5);}
 return save(s);
}
async function upload(s:State,c:Config){
 const batch=s.events.filter(e=>!s.uploaded.includes(e.id)).slice(0,20);
 if(!batch.length||Date.now()<s.nextAttempt)return s;
 try{
  const ack=await request(c,'/api/student/events',{...report(c,s),window_id:s.window.window_id,events:batch});
  if(ack.student_authenticated!==false||!Array.isArray(ack.accepted_ids)||batch.some(e=>!ack.accepted_ids.includes(e.id)))throw Error('서버 수신 확인 응답 오류');
  s.sent=(s.sent||0)+batch.length;
  const acknowledged=new Set(batch.map(e=>e.id));s.events=s.events.filter(e=>!acknowledged.has(e.id));s.uploaded=[];
  s.failures=0;s.nextAttempt=0;s.error='';
 }catch(e){s.failures++;s.nextAttempt=Date.now()+retryDelay(c.intervalMinutes,s.failures);s.error=String(e);s.window={active:false};s.status='전송 오류·수집 중지';}
 return s;
}
export function tick(trigger='alarm'){return serial(async()=>{
 let s=await refresh(trigger);
 if(s.window.active){const c=await settings();s=await upload(s,c);}
 return save(s);
});}
export function navigation(e:{url:string;frameId:number;documentLifecycle?:string},kind:'visit'|'spa'){return serial(async()=>{
 let s=await state();
 if(e.frameId!==0||(e.documentLifecycle&&e.documentLifecycle!=='active')||!active(s.window))return save({...s,window:s.window.ends_at&&Date.now()>=s.window.ends_at?{active:false}:s.window});
 try{
  const c=await settings();
  if(!c.testEnabled||(c.devicePolicy!=='allowlist'&&c.devicePolicy!=='policy'))return save({...s,window:{active:false},status:'시험 비활성·수집 없음'});
  const priorEmail=s.email;s=await profile(s,c);
  if(s.email!==priorEmail||s.deviceState!=='confirmed')return save({...s,window:{active:false},status:'계정 또는 기기 변경 · 수집 없음'});
  const current=await request(c,'/api/student/window') as Window;
  if(!current.active||current.window_id!==s.window.window_id||current.ends_at!==s.window.ends_at)return save({...s,window:{active:false},status:'교사 시험 중지 또는 변경 · 수집 없음'});
  const event=parseVisit(e.url,Date.now(),kind);
  if(event&&s.events.length<200){const last=s.lastVisit;if(!last||last.url!==event.url||last.search!==event.search||event.at-last.at>=1000){s.events.push(event);s.lastVisit=event;s.recorded=(s.recorded||0)+1;}}
  return save(await upload(s,c));
 }catch(e){return save({...s,window:{active:false},error:String(e),status:'기기·설정 확인 실패 · 수집 없음'});}
});}
function safely(p:Promise<unknown>){void p.catch(()=>undefined);}
chrome.webNavigation.onCommitted.addListener(e=>safely(navigation(e,'visit')));
chrome.webNavigation.onHistoryStateUpdated.addListener(e=>safely(navigation(e,'spa')));
chrome.runtime.onInstalled.addListener(()=>safely(tick('installed')));
chrome.runtime.onStartup.addListener(()=>safely(tick('startup')));
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)safely(tick());if(a.name==='school-email-stop')safely(serial(async()=>{const s=await state();if(!ongoing(s.window)&&s.window.ends_at&&Date.now()>=s.window.ends_at)await save({...s,window:{active:false},status:'수집 시간 종료 · 수집 없음'});}));});
chrome.storage.onChanged.addListener((_c,area)=>{if(area==='managed')safely(tick('managed_change'));});
chrome.identity.onSignInChanged.addListener(()=>safely(serial(async()=>{await save(empty());return refresh('account_change');})));
chrome.runtime.onMessage.addListener((m,sender,reply)=>{if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html'))return false;
 const operation=m?.action==='refresh'?tick():state();void operation.then(s=>{const {events,uploaded,lastVisit,...display}=s;reply({ok:true,state:{...display,count:s.recorded||0,sent:s.sent||0}});},e=>reply({ok:false,error:String(e)}));return true;});
safely(tick('worker_restart'));

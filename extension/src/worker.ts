import {ALARM,config,deviceStatus,ensureAlarm,labels,payload,retryDelay,schoolAccount} from './core.js';
export type Diag={account:string;device:string;auth:string;overall:string;email?:string;deviceId?:string;install?:string;platform?:string;version:string;lastRun:number;lastConnected?:number;nextAttempt?:number;failures:number;error:string;trigger:string};
let running:Promise<void>|undefined;
async function run(trigger:string){
 const previous=(await chrome.storage.local.get('diagnostic')).diagnostic as Diag|undefined;
 const manifest=chrome.runtime.getManifest();
 const d:Diag={account:labels.account_missing,device:labels.needs_check,auth:labels.auth_needed,overall:'설정 확인·대기',version:manifest.version,lastRun:Date.now(),lastConnected:previous?.lastConnected,failures:previous?.failures||0,nextAttempt:previous?.nextAttempt,error:'',trigger};
 let token:string|undefined;
 let c:ReturnType<typeof config>|undefined;
 try {
  // 로컬 진단은 설정·OAuth가 없는 경우에도 수행. 원본 오류는 로컬에만 저장.
  try {const p=await chrome.identity.getProfileUserInfo({accountStatus:chrome.identity.AccountStatus.ANY});d.email=p.email; if(schoolAccount(p)) d.account=labels.account_ok;} catch(e){d.error='계정 API: '+String(e);}
  try {d.install=(await chrome.management.getSelf()).installType;d.platform=(await chrome.runtime.getPlatformInfo()).os;
   d.deviceId=await chrome.enterprise?.deviceAttributes?.getDirectoryDeviceId()||'';
  }catch(e){d.error+=' 기기 API: '+String(e);}
  c=config(await chrome.storage.managed.get(null),manifest.host_permissions||[]);
  await ensureAlarm(chrome.alarms,c.intervalMinutes);
  d.device=deviceStatus(d.platform||'',d.install||'',d.deviceId||'',c)==='confirmed'?labels.confirmed:labels.needs_check;
  if(!c.testEnabled){d.overall='시험 비활성·안전 대기';d.nextAttempt=undefined;return;}
  if(d.account!==labels.account_ok){d.overall=labels.account_missing;return;}
  if(c.devicePolicy==='allowlist'&&d.device!==labels.confirmed){d.overall=labels.needs_check;return;}
  if(!manifest.oauth2?.client_id){d.error='빌드 OAuth client ID 설정 필요';return;}
  if(d.nextAttempt&&Date.now()<d.nextAttempt){d.auth=previous?.auth||labels.auth_needed;d.overall='재시도 대기';d.error=previous?.error||'';return;}
  try {const p=await chrome.identity.getProfileUserInfo({accountStatus:chrome.identity.AccountStatus.ANY});
   token=(await chrome.identity.getAuthToken({interactive:false,account:{id:p.id}})).token;
   if(!token) throw Error('토큰 없음');
  }catch(e){d.error='비대화형 OAuth 실패: '+String(e);d.overall=labels.auth_needed;throw e;}
  const request=async(path:string,body?:unknown)=>{
   let response:Response;
   try {response=await fetch(c!.serverUrl+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:'error',credentials:'omit',cache:'no-store'});}
   catch(e){d.auth=labels.connection_failed;throw e;}
   if(!response.ok){
    if(response.status===401){await chrome.identity.removeCachedAuthToken({token:token!});d.auth=labels.auth_needed;}
    else if(response.status===403||response.status===503) d.auth=labels.auth_needed;
    else d.auth=labels.connection_failed;
    throw Error('서버 HTTP '+response.status);
   }
   return response.json();
  };
  // 학생/기기 정보는 검증 성공 뒤에만 POST. 이메일은 절대 본문에 넣지 않음.
  const verified=await request('/api/auth/probe');
  if(verified.email?.toLowerCase()!==d.email?.toLowerCase()) {d.auth=labels.auth_needed;throw Error('OAuth 계정과 Chrome 프로필 불일치');}
  d.auth=labels.authenticated;
  const response=await request('/api/status',payload(c,{deviceId:d.deviceId||'',deviceState:d.device===labels.confirmed?'confirmed':'needs_check',installType:d.install||'unknown',platform:d.platform||'unknown',version:d.version,trigger,previousFailed:d.failures>0}));
  d.lastConnected=Date.now();d.failures=0;d.nextAttempt=undefined;d.error='';
  d.overall=d.device===labels.confirmed&&response.device_state==='confirmed'?labels.healthy:labels.needs_check;
 }catch(e){
  d.error=(d.error||String(e)).slice(0,500);
  if(c){d.failures++;d.nextAttempt=Date.now()+retryDelay(c.intervalMinutes,d.failures);
   if(token&&d.auth===labels.authenticated){d.auth=labels.connection_failed;d.overall=labels.connection_failed;}
   else if(token){d.overall=d.auth;}
  } else {await ensureAlarm(chrome.alarms,5);d.overall='관리 설정 오류·안전 대기';}
 }finally{await chrome.storage.local.set({diagnostic:d});}
}
export function tick(trigger:string){if(!running){running=run(trigger).catch(console.error).finally(()=>{running=undefined;});}return running;}
chrome.runtime.onInstalled.addListener(()=>{void tick('installed');});
chrome.runtime.onStartup.addListener(()=>{void tick('startup');});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM) void tick('alarm');});
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='managed') void tick('managed_change');});
chrome.identity.onSignInChanged.addListener(()=>{void tick('account_change');});
// 모든 worker 시작에서 누락된 alarm 복구. 무한 실행/자동 창 생성 없음.
void tick('worker_restart');

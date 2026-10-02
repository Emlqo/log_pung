import {LIMIT,type Session} from './core.js';
const message=document.querySelector('#message')!;
const status=document.querySelector('#status')!;
const table=document.querySelector('#events')!;
function render(s:Session){
 status.textContent=s.running?'수집 시험 실행 중 · 종료 '+new Date(s.endsAt!).toLocaleTimeString('ko-KR'):s.stoppedReason;
 document.querySelector('#count')!.textContent=`${s.events.length}건 / 최대 ${LIMIT}건${s.dropped?' · 한도 초과 '+s.dropped+'건 제외':''}`;
 document.querySelector('#upload')!.textContent=`서버 수신 확인 ${s.uploaded.length}건 · 시험 세션 ${s.runId||'없음'}${s.error?' · '+s.error:''}`;
 table.replaceChildren();
 for(const event of [...s.events].reverse()){
  const tr=document.createElement('tr');for(const value of [new Date(event.at).toLocaleTimeString('ko-KR'),event.url,event.search||'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);
 }
 (document.querySelector('#start') as HTMLButtonElement).disabled=s.running;
}
async function invoke(action:string,auth?:unknown){const r=await chrome.runtime.sendMessage({action,auth});if(!r?.ok)throw Error(r?.error||'worker 응답 없음');render(r.session);}
document.querySelector('#start')!.addEventListener('click',()=>{
 if(!(document.querySelector('#consent') as HTMLInputElement).checked){message.textContent='선생님 본인 Chrome 시험임을 먼저 체크해주세요.';return;}
 // 사용자 클릭 안에서만 optional 권한 요청. 설치/자동 실행 시 승인창 없음.
 void chrome.permissions.request({permissions:['webNavigation'],origins:['http://127.0.0.1:8765/*']}).then(async granted=>{
  if(!granted)throw Error('권한을 승인하지 않아 수집을 시작하지 않았습니다.');
  const input=document.querySelector('#password') as HTMLInputElement;const password=input.value;input.value='';
  if(!password)throw Error('서버 실행 때 정한 교사 시험 비밀번호를 입력하세요.');
  const bytes=new TextEncoder().encode('teacher:'+password);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const response=await fetch('http://127.0.0.1:8765/api/local/login',{method:'POST',headers:{Authorization:'Basic '+btoa(binary)},signal:AbortSignal.timeout(5000),redirect:'error',credentials:'omit'});
  if(!response.ok)throw Error('교사 시험 인증 실패 HTTP '+response.status);
  const auth=await response.json();await invoke('start',{token:auth.token,runId:auth.run_id,expiresAt:auth.expires_at});message.textContent='서버 인증 후 수집 시작 · 10분 뒤 종료 · 필요하면 즉시 중지하세요.';
 }).catch(e=>{message.textContent=String(e);});
});
for(const action of ['stop','clear','read'])document.querySelector('#'+action)!.addEventListener('click',()=>{void invoke(action).catch(e=>{message.textContent=String(e);});});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.localTest?.newValue)render(changes.localTest.newValue as Session);});
void invoke('read').catch(e=>{message.textContent=String(e);});

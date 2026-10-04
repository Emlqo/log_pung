const root=document.getElementById('state')!;
async function render(action='read'){
 const r=await chrome.runtime.sendMessage({action});root.replaceChildren();
 if(!r?.ok){root.textContent=r?.error||'상태 확인 실패';return;}
 const s=r.state;
 for(const [name,value] of [['상태',s.status],['Chrome 이메일 (인증 안 됨)',s.email||'확인 불가'],['정책 설치',s.install||'확인 전'],['학교 기기 ID',s.deviceId||'확인 불가'],['기기 조건',s.deviceState==='confirmed'?s.devicePolicy==='policy'?'정책 설치 대상 · 기기 인증 아님':'승인 ID와 일치 · 기기 인증 아님':'확인 필요'],['버전',s.version],['기록 / 서버 수신',`${s.count} / ${s.sent}건`],['마지막 연결',s.lastConnected?new Date(s.lastConnected).toLocaleString('ko-KR'):'없음 · 미사용을 의미하지 않음'],['최근 오류',s.error||'없음']]){const p=document.createElement('p');p.textContent=name+': '+value;root.append(p);}
}
document.getElementById('refresh')!.addEventListener('click',()=>void render('refresh'));
void render();chrome.storage.onChanged.addListener((_c,a)=>{if(a==='session')void render();});

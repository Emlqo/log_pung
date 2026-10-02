async function refresh(){
 const message=document.getElementById('message');
 try{const r=await fetch('/api/teacher/status',{cache:'no-store'});if(!r.ok) throw Error('HTTP '+r.status);
 const rows=await r.json();const root=document.getElementById('rows');root.replaceChildren();
 for(const row of rows){const tr=document.createElement('tr');
 for(const value of [row.account,row.device_state==='confirmed'?'학교 기기 대상 확인 완료':'정책 설치 또는 기기 정보 확인 필요',row.extension_version,row.auth_state,new Date(row.last_seen).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),row.recent_error==='none'?'보고 없음':'이전 요청 실패 · 로컬 상세 확인',row.delayed?'지연 · 원인 확인 필요':'최근 연결',row.trigger]){const td=document.createElement('td');td.textContent=value;tr.append(td);}root.append(tr);}
 message.textContent=rows.length?`${rows.length}개 계정·기기 상태 · 60초마다 갱신`:'수신 기록 없음 · 인증 전 오류는 로컬에서 확인';
 }catch(e){message.textContent='현황 조회 실패: '+String(e);}
}
document.getElementById('refresh').addEventListener('click',refresh);void refresh();setInterval(refresh,60000);

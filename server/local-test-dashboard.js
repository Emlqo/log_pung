async function refresh(){const message=document.getElementById('message');try{
 const r=await fetch('/api/local/view',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const rows=await r.json();const root=document.getElementById('rows');root.replaceChildren();
 for(const row of rows){const tr=document.createElement('tr');for(const value of [new Date(row.received_at).toLocaleString('ko-KR'),row.url,row.search||'—',row.kind,row.run_id]){const td=document.createElement('td');td.textContent=value;tr.append(td);}root.append(tr);}
 message.textContent=`서버 저장 ${rows.length}건 · 5초마다 갱신`;
}catch(e){message.textContent='조회 실패: '+String(e);}}
document.getElementById('refresh').addEventListener('click',refresh);
document.getElementById('delete').addEventListener('click',async()=>{
 if(!confirm('본인 시험 기록을 모두 삭제하고 현재 수집 시험 인증을 종료할까요?'))return;
 const r=await fetch('/api/local/records',{method:'DELETE'});if(!r.ok){document.getElementById('message').textContent='삭제 실패 HTTP '+r.status;return;}await refresh();
});void refresh();setInterval(refresh,5000);

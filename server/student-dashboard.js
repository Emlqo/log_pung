import {hostOf,filterEvents,filterStatuses,studentLabel} from './student-dashboard-filters.js';
const el=id=>document.getElementById(id);
let snapshot=null;let loading=false;
const filters=()=>Object.fromEntries(['email','range','site','kind','sort','query'].map(id=>[id,el(id).value]));
function text(tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;}
function choices(id,values,label,labelFor=v=>v){const select=el(id),chosen=select.value;const options=[...new Set(values.filter(Boolean))].sort();if(chosen&&!options.includes(chosen))options.push(chosen);select.replaceChildren(new Option(label,''),...options.map(v=>new Option(labelFor(v),v)));select.value=chosen;}
function emailButton(person){const email=person.email;const button=text('button',studentLabel(person),'email-button');button.type='button';button.addEventListener('click',()=>{el('email').value=email;render();});return button;}
function row(values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.append(typeof value==='string'?document.createTextNode(value):value);tr.append(td);}return tr;}
function emptyTable(id,columns,message){const tr=document.createElement('tr'),td=text('td',message,'empty');td.colSpan=columns;tr.append(td);el(id).append(tr);}
function render(){
 if(!snapshot)return;
 const selected=filters(),events=filterEvents(snapshot.events,selected),statuses=filterStatuses(snapshot.statuses,selected.email);
 el('events').replaceChildren();el('statuses').replaceChildren();
 for(const e of events){const address=document.createElement('div');address.append(text('strong',hostOf(e.url)||'사이트 확인 불가'),text('span',e.url,'url-detail'));el('events').append(row([emailButton(e),new Date(e.at).toLocaleString('ko-KR'),address,text('span',e.search||'—',e.search?'search-term':'muted')]));}
 if(!events.length)emptyTable('events',4,'조건에 맞는 기록이 없습니다. 필터를 바꾸거나 초기화해주세요.');
 for(const s of statuses){const state=document.createElement('div');state.append(text('span',s.delayed?'연결 지연':'최근 연결',s.delayed?'badge warning':'badge connected'));if(s.recent_error&&s.recent_error!=='none')state.append(text('span',s.recent_error,'url-detail'));const device=s.device_state==='confirmed'?(s.device_policy==='policy'?'정책 설치 대상':'승인 ID와 일치'):'기기 확인 필요';el('statuses').append(row([emailButton(s),device,s.extension_version,new Date(s.received_at).toLocaleString('ko-KR'),state]));}
 if(!statuses.length)emptyTable('statuses',5,'표시할 연결 상태가 없습니다.');
 const allEmails=new Set([...snapshot.statuses,...snapshot.events].map(x=>x.email));
 el('student-count').textContent=selected.email?(allEmails.has(selected.email)?'1':'0'):String(allEmails.size);
 el('connected-count').textContent=String(statuses.filter(s=>!s.delayed).length);
 el('record-count').textContent=String(events.length);el('search-count').textContent=String(events.filter(e=>e.search).length);
 el('status-count').textContent=`${statuses.length}명`;
 el('result-info').textContent=`불러온 ${snapshot.events.length}건 중 ${events.length}건 표시 · 마지막 갱신 ${new Date(snapshot.updated).toLocaleTimeString('ko-KR')}`;
}
async function refresh(){
 if(loading)return;loading=true;
 try{const r=await fetch('/api/teacher/view',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();snapshot={...data,updated:Date.now()};const observed=[...data.statuses,...data.events];const labels=new Map(observed.map(x=>[x.email,studentLabel(x)]));choices('email',observed.map(x=>x.email),'전체 학생',email=>labels.get(email)||email);choices('site',data.events.map(x=>hostOf(x.url)),'전체 사이트');render();el('message').textContent=data.active?'OFF를 누를 때까지 수집합니다.':'학생 확장은 최대 5분 뒤 ON을 확인합니다.';el('collection-state').textContent=data.active?'수집 ON':'수집 OFF';el('collection-state').className=data.active?'badge connected':'badge';}
 catch(e){el('message').textContent='조회 실패: '+String(e)+' · 기존 표는 마지막 성공 시점의 데이터입니다.';el('collection-state').textContent='연결 확인 필요';el('collection-state').className='badge warning';}
 finally{loading=false;}
}
for(const action of ['start','stop'])el(action).addEventListener('click',async()=>{const buttons=[el('start'),el('stop')];buttons.forEach(b=>b.disabled=true);try{const r=await fetch('/api/teacher/window/'+action,{method:'POST'});if(!r.ok){const d=await r.json();throw Error(d.detail||'HTTP '+r.status);}await refresh();}catch(e){el('message').textContent='조작 실패: '+String(e);}finally{buttons.forEach(b=>b.disabled=false);}});
el('filters').addEventListener('submit',e=>e.preventDefault());el('filters').addEventListener('input',render);el('filters').addEventListener('change',render);
el('reset').addEventListener('click',()=>{el('filters').reset();render();});
el('refresh').addEventListener('click',refresh);void refresh();setInterval(refresh,5000);

el('directory-upload').addEventListener('submit',async event=>{
 event.preventDefault();const file=el('directory-file').files[0];if(!file)return;
 const button=el('directory-save');button.disabled=true;
 try{
  if(file.size>2*1024*1024)throw Error('CSV는 2MB 이하만 등록할 수 있습니다.');
  const response=await fetch('/api/teacher/directory',{method:'POST',headers:{'Content-Type':'text/csv'},body:file});
  const result=await response.json();if(!response.ok)throw Error(result.detail||'HTTP '+response.status);
  el('directory-message').textContent=`명단 ${result.matched_directory_entries}명 등록 완료. 실제 연결·활동 기록이 있는 이메일에만 이름을 표시합니다.`;
  el('directory-file').value='';await refresh();
 }catch(error){el('directory-message').textContent='명단 등록 실패: '+String(error);}
 finally{button.disabled=false;}
});

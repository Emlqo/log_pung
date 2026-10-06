import {hostOf,filterStatuses,studentLabel,sortStudents,readApiResponse} from './student-dashboard-filters.js';
const el=id=>document.getElementById(id);
let snapshot=null;let loading=false;let classSnapshot=null;let classesLoading=false;let loadedFilters=null;let loadedParams=null;
const filters=()=>Object.fromEntries(['email','range','site','kind','sort','query'].map(id=>[id,el(id).value]));
function text(tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;}
function emailButton(person){const email=person.email;const button=text('button',studentLabel(person),'email-button');button.type='button';button.addEventListener('click',()=>{el('email').value=email;el('result-info').textContent='학생을 선택했습니다. 조회를 눌러 기록을 확인하세요.';});return button;}
function studentCell(person){
 const wrapper=document.createElement('div');wrapper.append(emailButton(person));
 const edit=text('button','별칭 수정','alias-edit');edit.type='button';edit.setAttribute('aria-label',studentLabel(person)+' 별칭 수정');
 edit.addEventListener('click',()=>{
  el('alias-form').dataset.email=person.email;el('alias-person').textContent=[person.display_name,person.email].filter(Boolean).join(' · ');
  el('alias-input').value=person.alias||'';el('alias-error').textContent='';el('alias-dialog').showModal();el('alias-input').focus();
 });wrapper.append(edit);return wrapper;
}
function studentChoices(){const observed=[...(snapshot?.statuses||[]),...(snapshot?.events||[]),...(classSnapshot?.students||[])];const people=sortStudents([...new Map(observed.map(x=>[x.email,x])).values()]);const select=el('email'),chosen=select.value;select.replaceChildren(new Option('전체 학생',''),...people.map(p=>new Option(studentLabel(p),p.email)));if(chosen&&!people.some(p=>p.email===chosen))select.add(new Option(chosen,chosen));select.value=chosen;}
function row(values){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.append(typeof value==='string'?document.createTextNode(value):value);tr.append(td);}return tr;}
function emptyTable(id,columns,message){const tr=document.createElement('tr'),td=text('td',message,'empty');td.colSpan=columns;tr.append(td);el(id).append(tr);}
function render(){
 if(!snapshot)return;
 const selected=loadedFilters||filters(),events=snapshot.events,statuses=filterStatuses(snapshot.statuses,selected.email);
 el('events').replaceChildren();el('statuses').replaceChildren();
 for(const e of events){const address=document.createElement('div');address.append(text('strong',hostOf(e.url)||'사이트 확인 불가'),text('span',e.url,'url-detail'));el('events').append(row([studentCell(e),new Date(e.at).toLocaleString('ko-KR'),address,text('span',e.search||'—',e.search?'search-term':'muted')]));}
 if(!events.length)emptyTable('events',4,'조건에 맞는 기록이 없습니다. 필터를 바꾸거나 초기화해주세요.');
 for(const s of sortStudents(statuses)){const state=document.createElement('div');state.append(text('span',s.delayed?'연결 지연':'최근 연결',s.delayed?'badge warning':'badge connected'));if(s.recent_error&&s.recent_error!=='none')state.append(text('span',s.recent_error,'url-detail'));const device=s.device_state==='confirmed'?(s.device_policy==='policy'?'정책 설치 대상':'승인 ID와 일치'):'기기 확인 필요';el('statuses').append(row([studentCell(s),device,s.extension_version,new Date(s.received_at).toLocaleString('ko-KR'),state]));}
 if(!statuses.length)emptyTable('statuses',5,'표시할 연결 상태가 없습니다.');
 const allEmails=new Set([...snapshot.statuses,...snapshot.events].map(x=>x.email));
 el('student-count').textContent=selected.email?(allEmails.has(selected.email)?'1':'0'):String(allEmails.size);
 el('connected-count').textContent=String(statuses.filter(s=>!s.delayed).length);
 el('record-count').textContent=String(snapshot.total);el('search-count').textContent=String(events.filter(e=>e.search).length);
 el('status-count').textContent=`${statuses.length}명`;
 el('result-info').textContent=`검색 결과 ${snapshot.total}건 · 현재 ${events.length}건 표시 · 마지막 조회 ${new Date(snapshot.updated).toLocaleTimeString('ko-KR')}`;
}
async function refresh(page=1){
 if(loading)return;loading=true;
 try{const f=page===1?filters():loadedFilters;const params=page===1?new URLSearchParams({period:f.range,email:f.email,query:f.query,site:f.site.trim(),kind:f.kind,sort:f.sort}):new URLSearchParams(loadedParams);if(page===1&&f.range==='custom'){params.set('start',el('date-start').value);params.set('end',el('date-end').value);}params.set('page',String(page));if(page!==1)params.set('until',String(snapshot.until));const r=await fetch('/api/teacher/view?'+params,{cache:'no-store'});if(!r.ok){const err=await r.json();throw Error(typeof err.detail==='string'?err.detail:'조회 조건을 확인해주세요.');}const data=await r.json();snapshot={...data,updated:Date.now()};loadedFilters={...f};loadedParams=params.toString();studentChoices();render();el('page-prev').disabled=page<=1;el('page-next').disabled=page*100>=data.total;el('page-info').textContent=`${page} / ${Math.max(1,Math.ceil(data.total/100))} 페이지`;el('message').textContent=data.active?'OFF를 누를 때까지 수집합니다.':'학생 확장은 최대 5분 뒤 ON을 확인합니다.';el('collection-state').textContent=data.active?'수집 ON':'수집 OFF';el('collection-state').className=data.active?'badge connected':'badge';}
 catch(e){el('message').textContent='조회 실패: '+String(e)+' · 기존 표는 마지막 성공 시점의 데이터입니다.';el('collection-state').textContent='연결 확인 필요';el('collection-state').className='badge warning';}
 finally{loading=false;}
}
for(const action of ['start','stop'])el(action).addEventListener('click',async()=>{const buttons=[el('start'),el('stop')];buttons.forEach(b=>b.disabled=true);try{const r=await fetch('/api/teacher/window/'+action,{method:'POST'});if(!r.ok){const d=await r.json();throw Error(d.detail||'HTTP '+r.status);}const active=action==='start';el('collection-state').textContent=active?'수집 ON':'수집 OFF';el('collection-state').className=active?'badge connected':'badge';el('message').textContent=active?'수집을 시작했습니다. 기록은 조회 버튼으로 확인하세요.':'수집을 중지했습니다.';}catch(e){el('message').textContent='조작 실패: '+String(e);}finally{buttons.forEach(b=>b.disabled=false);}});
el('filters').addEventListener('submit',e=>{e.preventDefault();void refresh();});el('filters').addEventListener('input',()=>{el('result-info').textContent='조건이 변경되었습니다. 조회를 눌러 적용하세요. 기존 표는 이전 조회 결과입니다.';});
el('reset').addEventListener('click',()=>{el('filters').reset();el('result-info').textContent='조건을 초기화했습니다. 조회를 눌러 적용하세요.';});
el('refresh').addEventListener('click',()=>{showTab('records');void refresh();});

el('directory-upload').addEventListener('submit',async event=>{
 event.preventDefault();const file=el('directory-file').files[0];if(!file)return;
 const button=el('directory-save');button.disabled=true;
 try{
  if(file.size>2*1024*1024)throw Error('CSV는 2MB 이하만 등록할 수 있습니다.');
  const response=await fetch('/api/teacher/directory',{method:'POST',headers:{'Content-Type':'text/csv'},body:file});
  const result=await readApiResponse(response);if(!response.ok)throw Error(result.detail||'HTTP '+response.status);
  el('directory-message').textContent=`명단 ${result.matched_directory_entries}명 등록 완료. 실제 연결·활동 기록이 있는 이메일에만 이름을 표시합니다.`;
  el('directory-file').value='';await refreshClasses();el('message').textContent='이름 연결 완료 · 조회를 누르면 기록에 반영됩니다.';
 }catch(error){el('directory-message').textContent='명단 등록 실패: '+String(error);}
 finally{button.disabled=false;}
});

el('alias-cancel').addEventListener('click',()=>el('alias-dialog').close());
el('alias-dialog').addEventListener('cancel',event=>{if(el('alias-save').disabled)event.preventDefault();});
el('alias-form').addEventListener('submit',async event=>{
 event.preventDefault();const email=el('alias-form').dataset.email,alias=el('alias-input').value;
 const buttons=[el('alias-save'),el('alias-cancel')];buttons.forEach(button=>button.disabled=true);el('alias-error').textContent='';
 try{
  const response=await fetch('/api/teacher/alias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,alias})});
  const result=await readApiResponse(response);if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'별칭을 저장할 수 없습니다. 입력 내용과 로그인을 확인해주세요.');
  if(snapshot){for(const row of [...snapshot.statuses,...snapshot.events])if(row.email===email)row.alias=result.alias;studentChoices();render();}
  if(classSnapshot){for(const row of classSnapshot.students)if(row.email===email)row.alias=result.alias;studentChoices();renderClasses();}
  el('alias-dialog').close();
 }catch(error){el('alias-error').textContent=String(error);}
 finally{buttons.forEach(button=>button.disabled=false);}
});

function showTab(name){
 for(const tab of ['classes','records']){const active=tab===name;el(tab+'-panel').hidden=!active;el('tab-'+tab).classList.toggle('primary',active);el('tab-'+tab).setAttribute('aria-pressed',String(active));}
}
for(const tab of ['classes','records'])el('tab-'+tab).addEventListener('click',()=>showTab(tab));
function openStudent(person){studentChoices();el('filters').reset();el('email').value=person.email;showTab('records');el('result-info').textContent='학생을 선택했습니다. 조회를 눌러 기록을 확인하세요. 기존 표는 이전 조회 결과입니다.';}
function classKey(p){return p.grade==null?'unassigned':`${p.grade}-${p.classroom}`;}
function renderClasses(){
 if(!classSnapshot)return;
 const selected=el('class-filter').value,query=el('class-query').value.normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
 const people=sortStudents(classSnapshot.students).filter(p=>!query||studentLabel(p).normalize('NFKC').toLocaleLowerCase('ko-KR').includes(query));
 const groups=[{key:'unassigned',label:'! 확인 필요'},...classSnapshot.classes.map(c=>({key:classKey(c),label:`${c.grade}학년 ${c.classroom}반`}))];
 el('class-groups').replaceChildren();
 for(const group of groups){
  if(selected!=='all'&&selected!==group.key)continue;
  const members=people.filter(p=>classKey(p)===group.key),section=document.createElement('section');section.className='class-group';
  section.append(text('h3',`${group.label} · ${members.length}명`,group.key==='unassigned'?'needs-check':''));
  if(!members.length)section.append(text('p','표시할 등록 학생이 없습니다.','muted'));
  const list=document.createElement('ul');list.className='class-students';
  for(const person of members){
   const li=document.createElement('li'),info=document.createElement('div');
   const button=text('button',studentLabel(person),'email-button');button.type='button';button.addEventListener('click',()=>openStudent(person));info.append(button);
   info.append(text('p',person.source==='unassigned'?'! '+person.reason:`${person.number==null?'번호 미지정':person.number+'번'} · ${person.source==='manual'?'수동 배정':'자동 배정'}`,person.source==='unassigned'?'needs-check':'muted'));
   const edit=text('button',person.source==='unassigned'?'반 지정':'반 이동');edit.type='button';edit.addEventListener('click',()=>openAssignment(person));li.append(info,edit);list.append(li);
  }
  section.append(list);el('class-groups').append(section);
 }
}
async function refreshClasses(){
 if(classesLoading)return;classesLoading=true;el('classes-refresh').disabled=true;el('class-year').disabled=true;
 try{
  const year=Number(el('class-year').value);if(!Number.isInteger(year)||year<2020||year>2100)throw Error('학년도를 확인해주세요.');
  const response=await fetch('/api/teacher/classes?year='+year,{cache:'no-store'});const data=await readApiResponse(response);if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'HTTP '+response.status);
  classSnapshot=data;const chosen=el('class-filter').value;
  el('class-filter').replaceChildren(new Option('전체 반','all'),new Option('! 확인 필요','unassigned'),...data.classes.map(c=>new Option(`${c.grade}학년 ${c.classroom}반`,classKey(c))));
  el('class-filter').value=[...el('class-filter').options].some(o=>o.value===chosen)?chosen:'all';
  const unmatched=data.students.filter(p=>p.source==='unassigned').length;
  el('classes-message').textContent=`등록 학생 ${data.students.length}명 · 확인 필요 ${unmatched}명 · 명렬표 ${data.roster_entries}명 · 갱신 ${new Date().toLocaleTimeString('ko-KR')}`;
  studentChoices();renderClasses();
 }catch(error){el('classes-message').textContent='명단 조회 실패: '+String(error)+' · 기존 목록은 마지막 성공 시점의 데이터입니다.';}
 finally{classesLoading=false;el('classes-refresh').disabled=false;el('class-year').disabled=false;}
}
el('class-year').value=String(new Date().getFullYear());
el('classes-refresh').addEventListener('click',refreshClasses);el('class-year').addEventListener('change',refreshClasses);
el('class-filter').addEventListener('change',renderClasses);el('class-query').addEventListener('input',renderClasses);
el('roster-upload').addEventListener('submit',async event=>{
 event.preventDefault();const file=el('roster-file').files[0];if(!file)return;el('roster-save').disabled=true;
 try{
  if(file.size>2*1024*1024)throw Error('XLSX는 2MB 이하만 올릴 수 있습니다.');
  const response=await fetch('/api/teacher/roster?year='+Number(el('class-year').value),{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file});
  const result=await readApiResponse(response);if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'업로드 내용을 확인해주세요.');
  el('roster-file').value='';await refreshClasses();
 }catch(error){el('classes-message').textContent='명렬표 연결 실패: '+String(error);}
 finally{el('roster-save').disabled=false;}
});
function openAssignment(person){
 el('class-form').dataset.email=person.email;el('class-form').dataset.year=String(classSnapshot.year);
 el('class-person').textContent=studentLabel(person);el('assign-grade').value=person.grade||'';el('assign-room').value=person.classroom||'';el('assign-number').value=person.number??'';
 el('class-error').textContent='';el('class-dialog').showModal();el('assign-grade').focus();
}
async function saveAssignment(reset){
 const buttons=['class-save','class-auto','class-cancel'].map(el);buttons.forEach(b=>b.disabled=true);el('class-error').textContent='';
 const data={email:el('class-form').dataset.email,year:Number(el('class-form').dataset.year),reset};
 if(!reset)Object.assign(data,{grade:Number(el('assign-grade').value),classroom:Number(el('assign-room').value),number:el('assign-number').value===''?null:Number(el('assign-number').value)});
 try{
  const response=await fetch('/api/teacher/class-assignment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await readApiResponse(response);
  if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'학년·반·번호 입력을 확인해주세요.');
  el('class-dialog').close();await refreshClasses();
 }catch(error){el('class-error').textContent=String(error);}
 finally{buttons.forEach(b=>b.disabled=false);}
}
el('class-form').addEventListener('submit',e=>{e.preventDefault();void saveAssignment(false);});
el('class-auto').addEventListener('click',()=>saveAssignment(true));el('class-cancel').addEventListener('click',()=>el('class-dialog').close());
el('class-dialog').addEventListener('cancel',e=>{if(el('class-save').disabled)e.preventDefault();});
void refreshClasses();

el('page-prev').addEventListener('click',()=>{if(snapshot&&snapshot.page>1)void refresh(snapshot.page-1);});
el('page-next').addEventListener('click',()=>{if(snapshot&&snapshot.page*100<snapshot.total)void refresh(snapshot.page+1);});
for(const id of ['date-start','date-end'])el(id).addEventListener('change',()=>{el('range').value='custom';});
const koreanDay=stamp=>new Date(stamp+9*3600000).toISOString().slice(0,10);
el('date-start').value=koreanDay(Date.now()-6*86400000);el('date-end').value=koreanDay(Date.now());
el('storage-refresh').addEventListener('click',async()=>{
 const button=el('storage-refresh');button.disabled=true;
 try{
  const response=await fetch('/api/teacher/storage',{cache:'no-store'});const data=await readApiResponse(response);if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'HTTP '+response.status);
  const mb=bytes=>(bytes/1000000).toLocaleString('ko-KR',{maximumFractionDigits:1})+' MB';
  const dateText=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'없음';
  const info=el('storage-info');info.replaceChildren();
  info.append(text('p',`현재 DB 크기: ${mb(data.used_bytes)} · ${data.size_source}`));
  if(data.reference_limit_bytes)info.append(text('p',`무료 기준 참고: 1 GB · 단순 비교 ${((data.used_bytes/data.reference_limit_bytes)*100).toFixed(1)}% · 참고 여유 ${mb(Math.max(0,data.reference_limit_bytes-data.used_bytes))} (실제 잔여 한도 아님)`));
  info.append(text('p',`7일 이내 기록: ${data.event_count.toLocaleString('ko-KR')}건 · 가장 오래된 기록: ${dateText(data.oldest_at)}`));
  info.append(text('p',`마지막 자동 정리: ${dateText(data.last_cleanup_at)}`));
  info.append(text('p',data.scheduled_cleanup_configured?'접속 시 자동 정리 + 하루 1회 정기 정리 설정됨':'접속 시 자동 정리 중 · 무접속일 정기 정리는 CRON_SECRET 설정 필요',data.scheduled_cleanup_configured?'muted':'needs-check'));
  el('storage-message').textContent=`확인 시각: ${dateText(data.checked_at)} · 7일 지난 활동은 조회에서 제외합니다.`;
 }catch(error){el('storage-message').textContent='용량 조회 실패: '+String(error);}
 finally{button.disabled=false;}
});

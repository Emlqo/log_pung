import test from 'node:test';
import assert from 'node:assert/strict';
import {filterEvents,filterStatuses,hostOf,studentLabel} from '../student-dashboard-filters.js';
const now=new Date(2026,9,4,14,30).getTime();
const events=[
 {email:'a@goedu.kr',at:now-60000,url:'https://www.google.com/search',search:'정보 수업'},
 {email:'a@goedu.kr',at:now-600000,url:'https://docs.google.com/document/1',search:''},
 {email:'b@goedu.kr',at:now-60000,url:'https://www.google.com/search',search:'PYTHON'},
 {email:'b@goedu.kr',at:now-7200000,url:'https://www.youtube.com/watch',search:''},
 {email:'a@goedu.kr',at:now-86400001,url:'https://old.example.org/',search:''}
];
const defaults={email:'',site:'',query:'',kind:'',range:'24h',sort:'newest'};
test('combined student, site, time and keyword filters select the matching record',()=>{
 const result=filterEvents(events,{...defaults,email:'a@goedu.kr',site:'google.com',range:'5m',query:'정보'},now);
 assert.equal(result.length,1);assert.equal(result[0].search,'정보 수업');
 assert.equal(filterEvents(events,{...defaults,query:'python'},now)[0].email,'b@goedu.kr');
 assert.equal(filterEvents(events,{...defaults,query:'docs.google'},now).length,1);
});
test('search and non-search views, sorting, and time boundaries',()=>{
 assert.equal(filterEvents(events,{...defaults,kind:'search'},now).length,2);
 assert.equal(filterEvents(events,{...defaults,kind:'visit'},now).length,2);
 assert.equal(filterEvents(events,{...defaults,range:'5m'},now).length,2);
 const sorted=filterEvents(events,{...defaults,sort:'oldest'},now);
 assert.equal(sorted[0].url,'https://www.youtube.com/watch');
 assert.equal(events[0].search,'정보 수업'); // Input remains unchanged across renders.
});
test('today uses browser local midnight and rejects invalid or future timestamps',()=>{
 const midnight=new Date(now);midnight.setHours(0,0,0,0);
 const rows=[{...events[0],at:midnight.getTime()-1},{...events[0],at:midnight.getTime()},
 { ...events[0],at:NaN},{...events[0],at:now+6000}];
 assert.equal(filterEvents(rows,{...defaults,range:'today'},now).length,1);
});
test('literal keyword matching, invalid URLs and empty results are safe',()=>{
 assert.equal(hostOf('bad URL'),'');assert.equal(hostOf('https://www.Google.com/search'),'google.com');
 assert.deepEqual(filterEvents(events,{...defaults,query:'[.*]'},now),[]);
 const malicious={...events[0],search:'<img src=x onerror=alert(1)>'};
 assert.equal(filterEvents([malicious],{...defaults,query:'<img'},now)[0].search,malicious.search);
 assert.deepEqual(filterEvents([],defaults,now),[]);
});
test('student selection affects connection status and clearing filters restores results',()=>{
 const statuses=[{email:'a@goedu.kr'},{email:'b@goedu.kr'}];
 assert.equal(filterStatuses(statuses,'a@goedu.kr').length,1);
 assert.equal(filterStatuses(statuses,'').length,2);
 assert.equal(filterEvents(events,{...defaults,email:'missing@goedu.kr'},now).length,0);
 assert.equal(filterEvents(events,defaults,now).length,4);
});


test('directory names enrich labels and keyword matching without changing email identity',()=>{
 const row={...events[0],display_name:'홍길동'};
 assert.equal(studentLabel(row),'홍길동 · a@goedu.kr');
 assert.equal(studentLabel(events[0]),'a@goedu.kr');
 assert.equal(filterEvents([row],{...defaults,query:'홍길동'},now).length,1);
 assert.equal(filterEvents([row],{...defaults,email:'a@goedu.kr'},now).length,1);
 assert.equal(filterEvents([row],{...defaults,email:'홍길동'},now).length,0);
});


test('aliases distinguish identical names, remain searchable, and clear to original name',()=>{
 const first={...events[0],display_name:'김민수',alias:'2학년 1반 3번'};
 const second={...events[0],email:'b@goedu.kr',display_name:'김민수',alias:'2학년 4반 12번'};
 assert.equal(studentLabel(first),'김민수 · 2학년 1반 3번 · a@goedu.kr');
 assert.equal(filterEvents([first,second],{...defaults,query:'4반 12번'},now)[0].email,'b@goedu.kr');
 assert.equal(filterEvents([first,second],{...defaults,query:'김민수'},now).length,2);
 assert.equal(studentLabel({...first,alias:''}),'김민수 · a@goedu.kr');
 assert.equal(studentLabel({email:'unknown@goedu.kr',alias:'1반 5번'}),'1반 5번 · unknown@goedu.kr');
});

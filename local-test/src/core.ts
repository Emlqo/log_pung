export const DURATION=10*60*1000;
export const LIMIT=200;
export type Visit={id:string;at:number;url:string;search:string|null;kind:'visit'|'spa'};
export type Session={running:boolean;startedAt:number|null;endsAt:number|null;stoppedReason:string;events:Visit[];dropped:number;error:string;token:string|null;runId:string|null;uploaded:string[];lastUploaded:number|null;failures:number;nextRetry:number;};
export function empty():Session{return {running:false,startedAt:null,endsAt:null,stoppedReason:'시작 전 · 수집하지 않음',events:[],dropped:0,error:'',token:null,runId:null,uploaded:[],lastUploaded:null,failures:0,nextRetry:0};}
export function start(now:number):Session{return {...empty(),running:true,startedAt:now,endsAt:now+DURATION,stoppedReason:''};}
export function expire(s:Session,now:number):Session {return s.running&&(!s.endsAt||now>=s.endsAt)?{...s,running:false,stoppedReason:'10분 시험 자동 종료'}:s;}
export function parseVisit(raw:string,at:number,kind:'visit'|'spa',id=crypto.randomUUID()):Visit|null {
 try{
  const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  let search:string|null=null;
  if(['www.google.com','google.com','www.google.co.kr','google.co.kr'].includes(u.hostname)&&u.pathname==='/search')search=u.searchParams.get('q');
  else if(['www.bing.com','bing.com'].includes(u.hostname)&&u.pathname==='/search')search=u.searchParams.get('q');
  else if(u.hostname==='search.naver.com'&&u.pathname==='/search.naver')search=u.searchParams.get('query');
  else if(u.hostname==='search.daum.net'&&u.pathname==='/search')search=u.searchParams.get('q');
  search=search?.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200)||null;
  // 일반 URL의 쿼리/fragment는 보관하지 않음. 알려진 검색 결과 URL에서 검색어만 별도 추출.
  return {id,at,url:(u.origin+u.pathname).slice(0,2048),search,kind};
 }catch{return null;}
}
export function append(s:Session,event:{url:string;frameId:number;documentLifecycle?:string},now:number,kind:'visit'|'spa'):Session {
 s=expire(s,now);
 if(!s.running||event.frameId!==0||(event.documentLifecycle&&event.documentLifecycle!=='active'))return s;
 const visit=parseVisit(event.url,now,kind);if(!visit)return s;
 const last=s.events.at(-1);
 if(last&&last.url===visit.url&&last.search===visit.search&&Math.abs(last.at-now)<1000)return s;
 if(s.events.length>=LIMIT)return {...s,dropped:s.dropped+1};
 return {...s,events:[...s.events,visit]};
}

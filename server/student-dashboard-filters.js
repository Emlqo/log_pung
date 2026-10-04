const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ko-KR');
export function hostOf(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}}
export function filterEvents(events,filters,now=Date.now()){
 const periods={'5m':300000,'15m':900000,'1h':3600000,'24h':86400000};
 const today=new Date(now);today.setHours(0,0,0,0);
 const since=filters.range==='today'?today.getTime():now-(periods[filters.range]||86400000);
 const query=normalized(filters.query).trim();
 return events.filter(e=>{
  if(!Number.isFinite(e.at)||e.at<since||e.at>now+5000)return false;
  if(filters.email&&e.email!==filters.email)return false;
  if(filters.site&&hostOf(e.url)!==filters.site)return false;
  if(filters.kind==='search'&&!e.search)return false;
  if(filters.kind==='visit'&&e.search)return false;
  return !query||normalized([e.email,e.url,e.search].join(' ')).includes(query);
 }).sort((a,b)=>filters.sort==='oldest'?a.at-b.at:b.at-a.at);
}
export function filterStatuses(statuses,email){return statuses.filter(s=>!email||s.email===email);}

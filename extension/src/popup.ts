import type {Diag} from './worker.js';
const root=document.querySelector('#diagnostic')!;
function row(name:string,value:unknown){const p=document.createElement('p');const b=document.createElement('strong');b.textContent=name+': ';p.append(b,document.createTextNode(String(value||'확인 전')));root.append(p);}
async function render(){root.replaceChildren();const d=(await chrome.storage.local.get('diagnostic')).diagnostic as Diag|undefined;
 if(!d){row('상태','첫 진단 대기');return;}
 for(const [name,key] of [['전체','overall'],['학교 계정','account'],['프로필 이메일 (로컬)','email'],['정책 설치 유형','install'],['플랫폼','platform'],['기기','device'],['Directory 기기 ID','deviceId'],['서버 인증','auth'],['버전','version'],['최근 실행 원인','trigger'],['최근 오류 (로컬)','error']]) row(name,d[key as keyof Diag]);
 row('최근 실행',new Date(d.lastRun).toLocaleString('ko-KR'));
 row('마지막 연결',d.lastConnected?new Date(d.lastConnected).toLocaleString('ko-KR'):'연결 없음 (기기 미사용을 의미하지 않음)');
 row('다음 요청 가능',d.nextAttempt?new Date(d.nextAttempt).toLocaleString('ko-KR'):'다음 주기');
}
void render();chrome.storage.onChanged.addListener((_c,a)=>{if(a==='local') void render();});

export type Config={serverUrl:string;schoolId:string;testEnabled:boolean;intervalMinutes:number;devicePolicy:'allowlist'|'diagnostic';allowedDeviceIds:string[]};
export const ALARM='pilot-tick';
export function config(raw:Record<string,unknown>,hosts:string[]):Config {
 const u=new URL(String(raw.serverUrl||''));
 if(u.protocol!=='https:' || u.origin!==raw.serverUrl || u.username || u.password || !hosts.includes(u.origin+'/*')) throw Error('서버 주소 누락·오류 또는 빌드 서버와 불일치');
 if(typeof raw.schoolId!=='string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(raw.schoolId)) throw Error('학교 식별값 누락·오류');
 if(typeof raw.testEnabled!=='boolean') throw Error('시험 활성화 설정 필요');
 const minutes=raw.intervalMinutes ?? 5;
 if(!Number.isInteger(minutes)||Number(minutes)<5||Number(minutes)>60) throw Error('간격은 5~60분 정수');
 if(raw.devicePolicy!=='allowlist'&&raw.devicePolicy!=='diagnostic') throw Error('기기 확인 정책 필요');
 const ids=raw.allowedDeviceIds ?? [];
 if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string'||!x.trim()||x.length>200)||ids.length>1000) throw Error('기기 목록 오류');
 if(raw.devicePolicy==='allowlist'&&ids.length===0) throw Error('허용 기기 목록 필요');
 return {serverUrl:u.origin,schoolId:raw.schoolId,testEnabled:raw.testEnabled,intervalMinutes:Number(minutes),devicePolicy:raw.devicePolicy,allowedDeviceIds:ids};
}
export function schoolAccount(p:{email:string;id:string}):boolean {return !!p.id&&/^[^@\s]+@goedu\.kr$/i.test(p.email);}
export function deviceStatus(platform:string,install:string,id:string,c:Config):'confirmed'|'needs_check' {
 return platform==='cros'&&install==='admin'&&!!id&&c.allowedDeviceIds.includes(id)?'confirmed':'needs_check';
}
export function retryDelay(minutes:number,failures:number):number {return Math.min(60,minutes*2**Math.min(failures,6))*60000;}
export async function ensureAlarm(api:{get:(n:string)=>Promise<{periodInMinutes?:number}|undefined>;create:(n:string,a:{periodInMinutes:number})=>Promise<void>},minutes:number){
 const existing=await api.get(ALARM);
 if(existing?.periodInMinutes!==minutes) await api.create(ALARM,{periodInMinutes:minutes});
}
export function payload(c:Config,d:{deviceId:string;deviceState:string;installType:string;platform:string;version:string;trigger:string;previousFailed?:boolean}) {
 return {school_id:c.schoolId,device_id:d.deviceId||null,device_state:d.deviceState,install_type:d.installType,platform:d.platform,extension_version:d.version,trigger:d.trigger,interval_minutes:c.intervalMinutes,recent_error:d.previousFailed?'previous_attempt_failed':'none'};
}
export const labels={account_ok:'학교 계정 확인 완료',account_missing:'계정 정보 확인 불가',needs_check:'정책 설치 또는 기기 정보 확인 필요',confirmed:'학교 기기 대상 확인 완료',authenticated:'서버 인증 완료',auth_needed:'인증 설정 필요',connection_failed:'서버 연결 실패',healthy:'시험 정상 동작'};

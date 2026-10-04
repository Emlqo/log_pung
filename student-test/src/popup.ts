const root=document.getElementById('state')!;
const labels=['기록 중','기록 중지','연결 오류 · 기록 중지'];
async function render(){
 try{
  const r=await chrome.runtime.sendMessage({action:'read'});
  root.textContent=r?.ok&&labels.includes(r.state?.displayStatus)?r.state.displayStatus:labels[2];
 }catch{root.textContent=labels[2];}
}
void render();
chrome.storage.onChanged.addListener((_c,a)=>{if(a==='session')void render();});

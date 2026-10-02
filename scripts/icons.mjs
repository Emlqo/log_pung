// PNG로 만든 단순 진단 상태 아이콘. 외부 이미지/네트워크 의존성 없음.
import {writeFile} from 'node:fs/promises';
import {zlibSync} from 'fflate';
const encoder=new TextEncoder();
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(name,data){const type=encoder.encode(name);const result=new Uint8Array(data.length+12);const view=new DataView(result.buffer);view.setUint32(0,data.length);result.set(type,4);result.set(data,8);view.setUint32(data.length+8,crc32(result.subarray(4,data.length+8)));return result;}
export async function icons(directory='dist'){for(const size of [16,48,128]){
 const data=new Uint8Array(size*(1+size*4));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4;
  const square=x>size*.23&&x<size*.77&&y>size*.17&&y<size*.83;
  const line=square&&x>size*.34&&x<size*.66&&((y>size*.32&&y<size*.39)||(y>size*.49&&y<size*.56)||(y>size*.65&&y<size*.72));
  data.set(line?[35,92,153,255]:square?[244,249,255,255]:[35,92,153,255],i);
 }
 const header=new Uint8Array(13);const view=new DataView(header.buffer);view.setUint32(0,size);view.setUint32(4,size);header[8]=8;header[9]=6;
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlibSync(data)),chunk('IEND',new Uint8Array())];
 const png=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let offset=0;for(const c of chunks){png.set(c,offset);offset+=c.length;}
 await writeFile(`${directory}/icon-${size}.png`,png);
}}

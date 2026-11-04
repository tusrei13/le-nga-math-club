import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';

// Native video controls require byte ranges for metadata and seeking.
export async function serveVideoFile(request,response,file){
  const info=await stat(file),size=info.size;
  if(!info.isFile()||!size){response.writeHead(404);response.end();return;}
  let start=0,end=size-1,status=200;
  const range=request.headers.range;
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
    const fail=()=>{response.writeHead(416,{'Content-Range':'bytes */'+size,'Accept-Ranges':'bytes'});response.end();};
    if(!match||!match[1]&&!match[2]){fail();return;}
    if(!match[1]){
      const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0){fail();return;}start=Math.max(0,size-suffix);
    }else{
      start=Number(match[1]);end=match[2]?Number(match[2]):size-1;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end){fail();return;}end=Math.min(end,size-1);
    }
    status=206;
  }
  const headers={'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-cache'};
  if(status===206)headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
  response.writeHead(status,headers);
  if(request.method==='HEAD'){response.end();return;}
  const stream=createReadStream(file,{start,end});
  stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
}

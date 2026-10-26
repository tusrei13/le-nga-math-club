import {SecurityError,secureResponse,policies,protectPagesPreview} from '../security.mjs';
import {handleStemApi,StemError} from '../stem-api.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const worker={async fetch(request,env){
  const url=new URL(request.url);
  try{
    protectPagesPreview(request);
    if(url.pathname.startsWith('/api/stem/'))return await handleStemApi(request,env.DB);
    if(url.pathname.startsWith('/api/'))return json({error:'API không tồn tại.'},404);
    if(url.pathname==='/healthz'){
      if(!env.DB||!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stem_enquiries'").bind().first())return json({status:'not_ready'},503);
      return json({status:'ok',site:'stem-maths'});
    }
    if(url.pathname==='/admin')return Response.redirect('https://le-nga-books.pages.dev/admin',302);
    if(url.pathname==='/robots.txt')return new Response(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nSitemap: ${url.origin}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
    if(url.pathname==='/sitemap.xml')return new Response(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url></urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
    return env.ASSETS.fetch(request);
  }catch(error){if(!(error instanceof StemError)&&!(error instanceof SecurityError))console.error('STEM API failure');return json({error:error instanceof StemError||error instanceof SecurityError?error.message:'Chưa thể xử lý yêu cầu. Vui lòng liên hệ CLB.'},error instanceof StemError||error instanceof SecurityError?error.status:500);}
}};
export default {async fetch(request,env){const path=new URL(request.url).pathname;return secureResponse(await worker.fetch(request,env),request,path.startsWith('/api/')||path==='/healthz'?policies.api:policies.stem);}};

import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';
async function handle(req:NextRequest,ctx:{params:Promise<{path:string[]}>}){
 try{
 const path=(await ctx.params).path;
 if(req.method!=='GET'&&req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'Недопустимый источник запроса.'},{status:403});
 if(path.join('/')==='auth/logout'&&req.method==='POST'){const out=NextResponse.json({ok:true});out.cookies.set('youtelejka_session','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});return out;}
 if(path.join('/')==='auth/use-telejka'&&req.method==='POST'){
  const token=req.cookies.get('telejka_session')?.value;
  if(!token||!/^[a-f0-9]{64}$/.test(token))return NextResponse.json({error:'Сначала войдите в TELEJKA.'},{status:401});
  const result=NextResponse.json({ok:true});result.cookies.set('youtelejka_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:31536000});return result;
 }
 if(!['auth','me','posts','uploads','gifs','users','follows'].includes(path[0]))return NextResponse.json({error:'Не найдено'},{status:404});
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
 if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>450000){await reader.cancel();return NextResponse.json({error:'Запрос слишком большой'},{status:413})}chunks.push(value)}}finally{reader.releaseLock()}}
 const headers=new Headers({'Content-Type':'application/json'});const session=req.cookies.get('youtelejka_session')?.value;if(session&&/^[a-f0-9]{64}$/.test(session))headers.set('Cookie','telejka_session='+session);
 const response=await fetch('https://1234news.vercel.app/api/telejka/'+path.map(encodeURIComponent).join('/')+req.nextUrl.search,{method:req.method,headers,body:req.method==='GET'?undefined:Buffer.concat(chunks),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
 const out=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});const cookie=response.headers.get('set-cookie');if(cookie?.startsWith('telejka_session='))out.set('set-cookie',cookie.replace('telejka_session=','youtelejka_session='));const retry=response.headers.get('retry-after');if(retry)out.set('retry-after',retry);
 return new NextResponse(response.body,{status:response.status,headers:out});
 }catch{return NextResponse.json({error:'Сервер временно недоступен. Повторите попытку.'},{status:503,headers:{'Retry-After':'15'}})}
}
export {handle as GET,handle as POST,handle as PATCH,handle as DELETE};

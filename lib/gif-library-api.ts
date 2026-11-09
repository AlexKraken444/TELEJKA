import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import sharp from 'sharp';
import {db} from './db';
import {FeatureError} from './api-error';
export async function gifLibraryApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string){
 if(path[0]!=='gifs')return;
 const sql=db(),reply=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 if(req.method==='GET'){
  const q=(req.nextUrl.searchParams.get('q')||'').slice(0,100),offset=Math.max(0,Math.min(10000,Number(req.nextUrl.searchParams.get('offset'))||0));
  return reply(await sql`SELECT u.id,g.title name,u.mime,u.size,g.owner_id FROM gif_library g JOIN uploads u ON u.id=g.upload_id WHERE g.title ILIKE ${'%'+q+'%'} ORDER BY g.created_at DESC,g.upload_id LIMIT 24 OFFSET ${offset}`);
 }
 if(req.method==='POST'){
  const id=z.uuid().parse(input.uploadId),title=z.string().trim().min(1).max(100).parse(input.title);
  const [file]=await sql`SELECT * FROM uploads WHERE id=${id} AND owner_id=${userId} AND chat_id IS NULL AND ready=true AND published=false AND mime='image/gif' AND size<=5242880`;
  if(!file)throw new FeatureError(400,'Загрузите GIF размером до 5 МБ.');
  const chunks=await sql`SELECT data FROM upload_chunks WHERE upload_id=${id} ORDER BY idx`;
  try{const meta=await sharp(Buffer.concat(chunks.map(c=>Buffer.from(c.data))),{limitInputPixels:16000000}).metadata();if(meta.format!=='gif'||!meta.width||!meta.height)throw Error();}catch{throw new FeatureError(400,'Файл не является корректной GIF.');}
  await sql.begin(async tx=>{
   await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
   const [count]=await tx`SELECT count(*)::int n FROM gif_library WHERE owner_id=${userId} AND created_at>now()-interval '1 day'`;
   if(count.n>=10)throw new FeatureError(429,'Можно добавить до 10 GIF в день.');
   const claimed=await tx`UPDATE uploads SET published=true WHERE id=${id} AND published=false RETURNING id`;
   if(!claimed.length)throw new FeatureError(409,'Файл уже опубликован.');
   await tx`INSERT INTO gif_library(upload_id,owner_id,title) VALUES(${id},${userId},${title})`;
  });return reply({ok:true});
 }return NextResponse.json({error:'Метод недоступен'},{status:405});
}

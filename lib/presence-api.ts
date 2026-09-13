import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from './db';
import {canSendChat} from './community-api';
export async function presenceApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string){
 const sql=db(),reply=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'no-store'}});
 if(path.join('/')==='hashtag'&&req.method==='GET'){
 const tag=z.string().min(1).max(100).parse(req.nextUrl.searchParams.get('tag')).toLowerCase();
 const offset=z.coerce.number().int().min(0).max(100000).parse(req.nextUrl.searchParams.get('offset')||0);
 const posts=await sql`SELECT p.*,telejka_user(p.user_id,${userId}::uuid) AS author FROM posts p WHERE telejka_can_view(p.user_id,${userId}::uuid) AND EXISTS(SELECT 1 FROM regexp_matches(p.body,'(^|[^[:alnum:]_])#([[:alnum:]_]+)','g') m WHERE lower(m[2])=${tag}) ORDER BY p.created_at DESC,p.id DESC LIMIT 20 OFFSET ${offset}`;
 const [count]=await sql`SELECT count(*)::int AS total FROM posts p WHERE telejka_can_view(p.user_id,${userId}::uuid) AND EXISTS(SELECT 1 FROM regexp_matches(p.body,'(^|[^[:alnum:]_])#([[:alnum:]_]+)','g') m WHERE lower(m[2])=${tag})`;
 return reply({posts,total:count.total});
 }
 if(path.join('/')==='presence'&&req.method==='POST'){await sql`INSERT INTO user_presence VALUES(${userId},now()) ON CONFLICT(user_id) DO UPDATE SET seen_at=now()`;return reply(await sql`SELECT user_id FROM user_presence WHERE seen_at>now()-interval '70 seconds' AND telejka_can_view(user_id,${userId}::uuid)`)}
 if(path[0]==='chats'&&path[2]==='presence'){const chat=z.uuid().parse(path[1]);await canSendChat(chat,userId);if(req.method==='POST'){const state=z.enum(['typing','uploading','idle']).parse(input.state);await sql`INSERT INTO chat_presence VALUES(${chat},${userId},${state},now()+interval '8 seconds') ON CONFLICT(chat_id,user_id) DO UPDATE SET state=EXCLUDED.state,expires_at=EXCLUDED.expires_at`;}
 if(req.method==='GET'||req.method==='POST')return reply(await sql`SELECT p.user_id,u.name,p.state FROM chat_presence p JOIN users u ON u.id=p.user_id WHERE p.chat_id=${chat} AND p.user_id<>${userId} AND p.expires_at>now() AND p.state<>'idle' AND telejka_can_view(p.user_id,${userId}::uuid)`)}
}

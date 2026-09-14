import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from './db';
import {canReadPost,canSendChat} from './community-api';
import {FeatureError} from './api-error';
import {envelopeSchema} from './feature-api';
export async function editShareApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string){
 const sql=db(),reply=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(path[0]==='posts'&&path[2]==='comments'&&path.length===4&&['PATCH','DELETE'].includes(req.method)){
  const postId=z.uuid().parse(path[1]),id=z.uuid().parse(path[3]);
  const [comment]=await sql`SELECT id,attachments FROM comments WHERE id=${id} AND post_id=${postId} AND user_id=${userId}`;
  if(!comment)throw new FeatureError(404,'Комментарий не найден.');
  if(req.method==='PATCH'){const body=z.string().trim().max(1000).parse(input.body);if(!body&&!comment.attachments?.length)throw new FeatureError(400,'Напишите текст.');await sql`UPDATE comments SET body=${body},edited_at=now() WHERE id=${id} AND user_id=${userId}`;}
  else await sql`DELETE FROM comments WHERE id=${id} AND user_id=${userId}`;
  return reply({ok:true});
 }
 if(path[0]==='posts'&&path[1]&&(path.length===2||path[2]==='repost')){
  const id=z.uuid().parse(path[1]);
  if(req.method==='GET'&&path.length===2){await canReadPost(id,userId);const [post]=await sql`SELECT p.*,(SELECT id FROM polls WHERE post_id=p.id) poll_id,telejka_user(p.user_id,${userId}::uuid) author FROM posts p WHERE p.id=${id}`;return reply(post);}
  if(req.method==='PATCH'&&path.length===2){const body=z.string().trim().max(5000).parse(input.body);const [post]=await sql`SELECT id,attachments FROM posts WHERE id=${id} AND user_id=${userId}`;if(!post)throw new FeatureError(404,'Пост не найден.');if(!body&&!post.attachments?.length)throw new FeatureError(400,'Напишите текст.');if((await sql`SELECT id FROM polls WHERE post_id=${id}`).length)throw new FeatureError(400,'Вопрос опубликованного опроса менять нельзя.');await sql`UPDATE posts SET body=${body},edited_at=now() WHERE id=${id} AND user_id=${userId}`;return reply({ok:true});}
  if(req.method==='POST'&&path[2]==='repost'){await canReadPost(id,userId);const [source]=await sql`SELECT id,repost_id,is_repost FROM posts WHERE id=${id}`;const target=source.repost_id||id;await canReadPost(target,userId);const [post]=await sql`INSERT INTO posts(user_id,body,repost_id,is_repost) VALUES(${userId},'',${target},true) RETURNING id`;return reply(post,201);}
 }
 if(path[0]==='chats'&&path[2]==='messages'&&path.length===4&&req.method==='PATCH'){
  const chatId=z.uuid().parse(path[1]),id=z.uuid().parse(path[3]);await canSendChat(chatId,userId);
  const envelope=envelopeSchema.parse(input.envelope);const [message]=await sql`SELECT id FROM messages WHERE id=${id} AND conversation_id=${chatId} AND user_id=${userId}`;if(!message)throw new FeatureError(404,'Сообщение не найдено.');if((await sql`SELECT id FROM polls WHERE message_id=${id}`).length)throw new FeatureError(400,'Вопрос опубликованного опроса менять нельзя.');
  const devices=await sql`SELECT d.id FROM device_keys d JOIN members m ON m.user_id=d.user_id WHERE m.conversation_id=${chatId}`;
  if(Object.keys(envelope.keys).length!==devices.length||devices.some(d=>!envelope.keys[d.id]))throw new FeatureError(409,'Список устройств изменился. Повторите сохранение.');
  await sql`UPDATE messages SET envelope=${sql.json(envelope)},edited_at=now() WHERE id=${id} AND user_id=${userId}`;return reply({ok:true});
 }
}

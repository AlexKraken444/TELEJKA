import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from './db';
import {FeatureError} from './api-error';
import {canSendChat} from './community-api';
export async function messagePinsApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string){
 if(path[0]!=='chats'||path[2]!=='pins'||![3,4].includes(path.length))return;
 const chatId=z.uuid().parse(path[1]),sql=db();
 const [member]=await sql`SELECT 1 FROM members WHERE conversation_id=${chatId} AND user_id=${userId}`;
 if(!member)throw new FeatureError(404,'Чат не найден.');
 if(req.method==='POST'||req.method==='DELETE'){
 await canSendChat(chatId,userId);const messageId=z.uuid().parse(req.method==='DELETE'?path[3]:input.messageId);
 const [message]=await sql`SELECT id FROM messages WHERE id=${messageId} AND conversation_id=${chatId}`;
 if(!message)throw new FeatureError(404,'Сообщение не найдено.');
 if(req.method==='POST')await sql.begin(async tx=>{await tx`SELECT id FROM conversations WHERE id=${chatId} FOR UPDATE`;const [n]=await tx`SELECT count(*)::int n FROM message_pins WHERE conversation_id=${chatId}`;if(n.n>=20)throw new FeatureError(400,'Можно закрепить до 20 сообщений.');await tx`INSERT INTO message_pins(conversation_id,message_id,pinned_by) VALUES(${chatId},${messageId},${userId}) ON CONFLICT DO NOTHING`;});
 else await sql`DELETE FROM message_pins WHERE conversation_id=${chatId} AND message_id=${messageId}`;
 }else if(req.method!=='GET')throw new FeatureError(405,'Метод не поддерживается.');
 const rows=await sql`SELECT m.*,telejka_user(m.user_id,${userId}::uuid) author,(SELECT id FROM polls WHERE message_id=m.id) poll_id FROM message_pins p JOIN messages m ON m.id=p.message_id WHERE p.conversation_id=${chatId} ORDER BY p.created_at DESC LIMIT 20`;
 return NextResponse.json(rows,{headers:{'Cache-Control':'no-store'}});
}

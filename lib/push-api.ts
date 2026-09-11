import webpush from 'web-push';
import {NextRequest,NextResponse,after} from 'next/server';
import {db} from './db';
import {COOKIE,hashToken} from './auth';
import {FeatureError} from './api-error';
import {pushSubscriptionSchema} from './push-validation';
async function vapid(){
 const sql=db();const [existing]=await sql`SELECT public_key,private_key FROM telejka_auth.push_keys WHERE id=true`;
 if(existing)return existing;
 const keys=webpush.generateVAPIDKeys();
 await sql`INSERT INTO telejka_auth.push_keys(id,public_key,private_key) VALUES(true,${keys.publicKey},${keys.privateKey}) ON CONFLICT DO NOTHING`;
 const [saved]=await sql`SELECT public_key,private_key FROM telejka_auth.push_keys WHERE id=true`;return saved;
}
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'no-store'}});
export async function pushApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string){
 if(path[0]!=='push')return;
 const sql=db();
 if(path.join('/')==='push/status'&&req.method==='GET'){
  const token=req.cookies.get(COOKIE)?.value;
  const rows=token?await sql`SELECT id FROM push_subscriptions WHERE user_id=${userId} AND session_hash=${hashToken(token)}`:[];
  return json({connected:rows.length>0});
 }
 if(path.join('/')==='push/test'&&req.method==='POST'){
  const token=req.cookies.get(COOKIE)?.value;
  const subs=token?await sql`SELECT * FROM push_subscriptions WHERE user_id=${userId} AND session_hash=${hashToken(token)}`:[];
  if(!subs.length)throw new FeatureError(409,'Это устройство не подключено к серверу. Нажмите «Включить уведомления».');
  const [limit]=await sql`INSERT INTO rate_limits(key,count,resets_at) VALUES (${'push-test:'+userId},1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<now() THEN 1 ELSE rate_limits.count+1 END,resets_at=CASE WHEN rate_limits.resets_at<now() THEN now()+interval '1 minute' ELSE rate_limits.resets_at END RETURNING count`;
  if(limit.count>3)throw new FeatureError(429,'Подождите минуту перед следующей проверкой.');
  const keys=await vapid();
  for(const sub of subs){try{
   await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({userId,messageId:crypto.randomUUID()}),{vapidDetails:{subject:'https://telejka.vercel.app',publicKey:keys.public_key,privateKey:keys.private_key},TTL:300,urgency:'high',timeout:8000});
  }catch(error){
   const status=(error as {statusCode?:number}).statusCode;
   if(status===404||status===410){await sql`DELETE FROM push_subscriptions WHERE id=${sub.id}`;throw new FeatureError(409,'Подключение устарело. Отключите уведомления и включите снова.');}
   throw new FeatureError(502,'Служба push не приняла уведомление'+(status?' (код '+status+')':' — соединение прервано')+'. Повторите подключение.');
  }}
  return json({ok:true});
 }
 if(path.join('/')==='push/key'&&req.method==='GET'){const keys=await vapid();return json({publicKey:keys.public_key})}
 if(path.join('/')==='push/subscription'&&req.method==='POST'){
  const data=pushSubscriptionSchema.parse(input),token=req.cookies.get(COOKIE)?.value;
  if(!token)throw new FeatureError(401,'Войдите в аккаунт.');
  await sql.begin(async tx=>{
   await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
   const [count]=await tx`SELECT count(*)::int n FROM push_subscriptions WHERE user_id=${userId} AND endpoint<>${data.endpoint}`;
   if(count.n>=5)throw new FeatureError(400,'Можно подключить до 5 устройств. Отключите уведомления на одном из них.');
   await tx`INSERT INTO push_subscriptions(user_id,session_hash,endpoint,p256dh,auth) VALUES(${userId},${hashToken(token)},${data.endpoint},${data.keys.p256dh},${data.keys.auth}) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,session_hash=EXCLUDED.session_hash,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,updated_at=now()`;
  });return json({ok:true});
 }
 if(path.join('/')==='push/subscription'&&req.method==='DELETE'){
  // Delete only this authenticated browser session's subscriptions.
  const token=req.cookies.get(COOKIE)?.value;
  if(token)await sql`DELETE FROM push_subscriptions WHERE user_id=${userId} AND session_hash=${hashToken(token)}`;
  return json({ok:true});
 }
}
// Called after a message transaction commits. Delivery is independent of open tabs.
export function scheduleMessagePush(messageId:string){
 after(async()=>{try{await deliverMessagePush(messageId)}catch{console.error('TELEJKA push delivery failed')}});
}
export async function deliverMessagePush(messageId:string){
 const sql=db();
 const [message]=await sql`SELECT id,conversation_id,user_id FROM messages WHERE id=${messageId}`;
 if(!message)return;
 await sql`INSERT INTO push_deliveries(message_id,subscription_id)
 SELECT ${messageId},s.id FROM push_subscriptions s JOIN members m ON m.user_id=s.user_id JOIN sessions se ON se.token_hash=s.session_hash
 WHERE m.conversation_id=${message.conversation_id} AND s.user_id<>${message.user_id} AND se.expires_at>now()
 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=s.user_id AND b.blocked_id=${message.user_id}) OR (b.blocked_id=s.user_id AND b.user_id=${message.user_id})) ON CONFLICT DO NOTHING`;
 const rows=await sql`SELECT d.subscription_id FROM push_deliveries d WHERE d.message_id=${messageId} AND d.sent_at IS NULL AND d.attempts<3`;
 if(!rows.length)return;
 const keys=await vapid();
 await Promise.allSettled(rows.map(async row=>{
  for(let attempt=0;attempt<3;attempt++){
   const [claim]=await sql`UPDATE push_deliveries SET attempts=attempts+1,leased_until=now()+interval '30 seconds' WHERE message_id=${messageId} AND subscription_id=${row.subscription_id} AND sent_at IS NULL AND attempts<3 AND (leased_until IS NULL OR leased_until<now()) RETURNING attempts`;
   if(!claim)return;
   const [sub]=await sql`SELECT s.* FROM push_subscriptions s JOIN sessions se ON se.token_hash=s.session_hash JOIN members m ON m.user_id=s.user_id WHERE s.id=${row.subscription_id} AND se.expires_at>now() AND m.conversation_id=${message.conversation_id} AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=s.user_id AND b.blocked_id=${message.user_id}) OR (b.blocked_id=s.user_id AND b.user_id=${message.user_id}))`;
   if(!sub)return;
   try{
    await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:'TELEJKA',body:'Новое сообщение',messageId,chatId:message.conversation_id,userId:sub.user_id}),{vapidDetails:{subject:'https://telejka.vercel.app',publicKey:keys.public_key,privateKey:keys.private_key},TTL:86400,urgency:'high',timeout:4000,topic:messageId.replaceAll('-','')});
    await sql`UPDATE push_deliveries SET sent_at=now(),leased_until=NULL WHERE message_id=${messageId} AND subscription_id=${sub.id}`;
    await sql`INSERT INTO notification_deliveries(user_id,message_id) VALUES(${sub.user_id},${messageId}) ON CONFLICT DO NOTHING`;
    return;
   }catch(error){
    const status=(error as {statusCode?:number}).statusCode;
    if(status===404||status===410){await sql`DELETE FROM push_subscriptions WHERE id=${sub.id}`;return}
    await sql`UPDATE push_deliveries SET leased_until=NULL WHERE message_id=${messageId} AND subscription_id=${sub.id}`;
    if(status&&status>=400&&status<500&&status!==429)return;
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
   }
  }
 }));
}

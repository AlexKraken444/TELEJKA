import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {db} from './db';
import {FeatureError} from './api-error';
import {canContact,canSendChat} from './community-api';
import {VERIFICATION_OWNER_ID} from './verification';
import {COOKIE,hashToken} from './auth';
import {studioSchema} from './studio-schema';
const json=(v:unknown)=>NextResponse.json(v,{headers:{'Cache-Control':'no-store'}});
const payload=z.object({question:z.string().trim().min(1).max(300),options:z.array(z.string().trim().min(1).max(150)).min(2).max(10)}).strict();
const envelope=z.object({v:z.literal(1),iv:z.string().length(16),ciphertext:z.string().min(24).max(20000),keys:z.record(z.uuid(),z.string().length(344))}).strict();
export async function socialStudioApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string):Promise<Response|undefined>{
 const sql=db(),route=path.join('/');
 if(path[0]==='follows'&&path.length===2){const target=z.uuid().parse(path[1]);
  if(req.method==='POST'){if(target===userId)throw new FeatureError(400,'Нельзя подписаться на себя.');await canContact(userId,target);await sql`INSERT INTO follows VALUES(${userId},${target}) ON CONFLICT DO NOTHING`;}
  else if(req.method==='DELETE')await sql`DELETE FROM follows WHERE follower=${userId} AND followed=${target}`;
  else if(req.method!=='GET')return;
  const [result]=await sql`SELECT (SELECT count(*)::int FROM follows WHERE followed=${target}) followers,(SELECT count(*)::int FROM follows WHERE follower=${target}) following,EXISTS(SELECT 1 FROM follows WHERE follower=${userId} AND followed=${target}) subscribed`;return json(result);
 }
 if(path[0]==='polls'){
  if(path.length===1){const chat=req.nextUrl.searchParams.get('chat');if(chat){z.uuid().parse(chat);await canSendChat(chat,userId);}
   if(req.method==='GET'){const author=req.nextUrl.searchParams.get('author');if(author)z.uuid().parse(author);
    return json(await sql`SELECT p.*,telejka_user(p.owner_id,${userId}::uuid) author,COALESCE((SELECT jsonb_object_agg(v.choice,v.n) FROM (SELECT choice,count(*)::int n FROM poll_votes WHERE poll_id=p.id GROUP BY choice)v),'{}') counts,(SELECT choice FROM poll_votes WHERE poll_id=p.id AND user_id=${userId}) choice FROM polls p WHERE p.chat_id IS NOT DISTINCT FROM ${chat}::uuid AND (${chat}::uuid IS NOT NULL OR telejka_can_view(p.owner_id,${userId}::uuid)) AND (${author}::uuid IS NULL OR p.owner_id=${author}::uuid) ORDER BY p.created_at DESC LIMIT 50`);}
   if(req.method==='POST'){const parsed=chat?envelope.parse(input.payload):payload.parse(input.payload);const n=chat?z.number().int().min(2).max(10).parse(input.optionCount):payload.parse(parsed).options.length;
    const [row]=await sql`INSERT INTO polls(owner_id,chat_id,payload,option_count) VALUES(${userId},${chat},${sql.json(parsed)},${n}) RETURNING id`;return json(row);}
  }
  if(path.length===2&&req.method==='POST'){const pid=z.uuid().parse(path[1]);const [poll]=await sql`SELECT * FROM polls WHERE id=${pid}`;if(!poll)throw new FeatureError(404,'Опрос не найден.');if(poll.chat_id)await canSendChat(poll.chat_id,userId);else await canContact(userId,poll.owner_id);const choice=z.number().int().min(0).max(poll.option_count-1).parse(input.choice);await sql`INSERT INTO poll_votes VALUES(${pid},${userId},${choice}) ON CONFLICT(poll_id,user_id) DO UPDATE SET choice=EXCLUDED.choice`;return json({ok:true});}
 }
 if(path[0]!=='studio')return;
 if(route==='studio'&&req.method==='GET'){const [row]=await sql`SELECT revision,config FROM studio_settings WHERE id=1`;return json(row);}
 if(userId!==VERIFICATION_OWNER_ID)throw new FeatureError(403,'Доступ только владельцу TELEJKA.');
 const token=req.cookies.get(COOKIE)?.value;if(!token)throw new FeatureError(401,'Войдите в аккаунт.');const session=hashToken(token);
 if(route==='studio/unlock'&&req.method==='POST'){
  const password=z.string().max(200).parse(input.password);
  const [attempt]=await sql`INSERT INTO studio_attempts(user_id,attempts) VALUES(${userId},1) ON CONFLICT(user_id) DO UPDATE SET attempts=CASE WHEN studio_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE studio_attempts.attempts+1 END,window_start=CASE WHEN studio_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE studio_attempts.window_start END RETURNING attempts`;
  if(attempt.attempts>5)throw new FeatureError(429,'Слишком много попыток. Повторите через 15 минут.');
  const [credential]=await sql`SELECT password_hash FROM telejka_auth.studio_credentials WHERE id=1`;
  if(!credential||!await bcrypt.compare(password,credential.password_hash))throw new FeatureError(403,'Неверный пароль.');
  await sql`DELETE FROM studio_attempts WHERE user_id=${userId}`;
  await sql`INSERT INTO studio_unlocks VALUES(${session},now()+interval '1 hour') ON CONFLICT(session_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at`;return json({ok:true});
 }
 const [unlocked]=await sql`SELECT 1 FROM studio_unlocks WHERE session_hash=${session} AND expires_at>now()`;if(!unlocked)throw new FeatureError(403,'Введите пароль админки.');
 if(route==='studio/history'&&req.method==='GET')return json(await sql`SELECT * FROM studio_history ORDER BY revision DESC LIMIT 20`);
 if(route==='studio'&&req.method==='POST'){const config=studioSchema.parse(input.config),revision=z.number().int().nonnegative().parse(input.revision);await sql.begin(async tx=>{const [old]=await tx`SELECT * FROM studio_settings WHERE id=1 FOR UPDATE`;if(old.revision!==revision)throw new FeatureError(409,'Настройки уже изменены. Обновите страницу.');await tx`INSERT INTO studio_history(revision,config) VALUES(${old.revision},${tx.json(old.config)})`;await tx`UPDATE studio_settings SET config=${tx.json(config)},revision=revision+1 WHERE id=1`;});return json({ok:true});}
}

import {randomInt} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from './db';
import {FeatureError} from './api-error';
import {canManageVerification} from './verification';
import {pickPrize} from './prizes';
const id=z.uuid(),priceSchema=z.number().int().min(1).max(1000000000000);
const reply=(value:unknown)=>NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
export async function economyApi(req:NextRequest,path:string[],input:Record<string,unknown>,userId:string){
 const route=path.join('/'),sql=db();
 if(!['economy','market','rewards/spin'].includes(route)&&!['market','inventory'].includes(path[0]))return;
 const unlimited=await canManageVerification(userId);
 if(route==='economy'&&req.method==='GET'){
  const items=await sql`SELECT i.*,(SELECT id FROM market_listings WHERE item_id=i.id AND status='open') listing_id FROM reward_items i WHERE owner_id=${userId} AND NOT consumed ORDER BY created_at DESC LIMIT 200`;
  const [wallet]=await sql`SELECT trunc(balance)::text balance FROM wallets WHERE user_id=${userId}`;
  const [user]=await sql`SELECT plus_until FROM users WHERE id=${userId}`;
  return reply({items,balance:wallet?.balance||'0',unlimited,plus_until:user.plus_until});
 }
 if(route==='market'&&req.method==='GET'){
  const offset=z.coerce.number().int().min(0).max(100000).parse(req.nextUrl.searchParams.get('offset')||0);
  return reply(await sql`SELECT l.id,l.price::text price,l.seller_id,i.kind,i.seconds,i.tier,telejka_user(l.seller_id,${userId}::uuid) seller FROM market_listings l JOIN reward_items i ON i.id=l.item_id WHERE l.status='open' ORDER BY l.created_at DESC,l.id LIMIT 40 OFFSET ${offset}`);
 }
 if(route==='rewards/spin'&&req.method==='POST'){
  const {stake,requestId}=z.object({stake:z.number().int().min(10).max(1000),requestId:id}).strict().parse(input);
  const result=await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(847291064)`;
   const [old]=await tx`SELECT prize,item_id,stake FROM reward_spins WHERE user_id=${userId} AND request_id=${requestId}`;if(old)return old;
   await tx`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
   const [wallet]=await tx`SELECT balance>=${stake} enough FROM wallets WHERE user_id=${userId} FOR UPDATE`;
   if(!unlimited&&!wallet.enough)throw new FeatureError(400,'Недостаточно БАТОНчиков.');
   const prize=pickPrize(stake,randomInt(100000)),won=prize==='baton10'?10:prize==='baton30'?30:0;
   let itemId:string|null=null;
   if(!won){const [item]=await tx`INSERT INTO reward_items(owner_id,kind,tier) VALUES(${userId},${prize},'mini') RETURNING id`;itemId=item.id;}
   const delta=won-(unlimited?0:stake);
   await tx`UPDATE wallets SET balance=balance+${delta} WHERE user_id=${userId}`;
   await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},${'spin:'+requestId},${delta})`;
   await tx`INSERT INTO reward_spins(user_id,request_id,stake,prize,item_id) VALUES(${userId},${requestId},${stake},${prize},${itemId})`;
   return {prize,item_id:itemId,stake};
  });return reply(result);
 }
 if(route==='market/list'&&req.method==='POST'){
  const {itemId,price,activeSubscription,requestId}=z.object({itemId:id.optional(),price:priceSchema,activeSubscription:z.boolean().optional(),requestId:id}).strict().parse(input);
  return reply(await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(847291064)`;
   const [old]=await tx`SELECT id FROM market_listings WHERE seller_id=${userId} AND request_id=${requestId}`;if(old)return old;
   let target=itemId;
   if(activeSubscription){
    // Same lock order as purchasing Plus: wallet before user.
    await tx`SELECT user_id FROM wallets WHERE user_id=${userId} FOR UPDATE`;
    const [u]=await tx`SELECT plus_until>now() active,plus_until>='9999-01-01'::timestamptz permanent,greatest(0,floor(extract(epoch FROM plus_until-now())))::bigint seconds FROM users WHERE id=${userId} FOR UPDATE`;
    if(!u.active)throw new FeatureError(400,'Нет действующей подписки.');
    const [item]=await tx`INSERT INTO reward_items(owner_id,kind,seconds) VALUES(${userId},${u.permanent?'forever':'time'},${u.permanent?null:u.seconds}) RETURNING id`;target=item.id;
    await tx`UPDATE users SET plus_until=now() WHERE id=${userId}`;
   }
   if(!target)throw new FeatureError(400,'Выберите предмет.');
   const [item]=await tx`SELECT id FROM reward_items WHERE id=${target} AND owner_id=${userId} AND NOT consumed FOR UPDATE`;
   if(!item)throw new FeatureError(404,'Предмет недоступен.');
   const [existing]=await tx`SELECT id FROM market_listings WHERE item_id=${target} AND status='open'`;if(existing)throw new FeatureError(409,'Предмет уже на рынке.');
   const [listing]=await tx`INSERT INTO market_listings(item_id,seller_id,price,request_id) VALUES(${target},${userId},${price},${requestId}) RETURNING id`;return listing;
  }));
 }
 if(path[0]==='market'&&path.length===3&&req.method==='POST'&&['buy','cancel'].includes(path[2])){
  const listingId=id.parse(path[1]);
  await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(847291064)`;
   const [l]=await tx`SELECT * FROM market_listings WHERE id=${listingId} FOR UPDATE`;
   if(!l)throw new FeatureError(404,'Объявление не найдено.');
   if(path[2]==='cancel'){
    if(l.seller_id!==userId)throw new FeatureError(403,'Это чужое объявление.');
    if(l.status==='sold')throw new FeatureError(409,'Предмет уже продан.');
    await tx`UPDATE market_listings SET status='cancelled' WHERE id=${listingId}`;return;
   }
   if(l.status==='sold'&&l.buyer_id===userId)return;
   if(l.status!=='open')throw new FeatureError(409,'Предмет больше не продаётся.');
   if(l.seller_id===userId)throw new FeatureError(400,'Нельзя купить свой предмет.');
   await tx`INSERT INTO wallets(user_id) VALUES(${userId}),(${l.seller_id}) ON CONFLICT DO NOTHING`;
   await tx`SELECT user_id FROM wallets WHERE user_id IN (${userId},${l.seller_id}) ORDER BY user_id FOR UPDATE`;
   const [w]=await tx`SELECT balance>=${l.price} enough FROM wallets WHERE user_id=${userId}`;
   if(!unlimited&&!w.enough)throw new FeatureError(400,'Недостаточно БАТОНчиков.');
   if(!unlimited)await tx`UPDATE wallets SET balance=balance-${l.price} WHERE user_id=${userId}`;
   await tx`UPDATE wallets SET balance=balance+${l.price} WHERE user_id=${l.seller_id}`;
   await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},${'buy:'+listingId},${unlimited?'0':'-'+l.price}),(${l.seller_id},${'sell:'+listingId},${l.price})`;
   await tx`UPDATE reward_items SET owner_id=${userId} WHERE id=${l.item_id}`;
   await tx`UPDATE market_listings SET status='sold',buyer_id=${userId} WHERE id=${listingId}`;
  });return reply({ok:true});
 }
 if(path[0]==='inventory'&&path[2]==='activate'&&path.length===3&&req.method==='POST'){
  const itemId=id.parse(path[1]);
  await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(847291064)`;
   const [item]=await tx`SELECT * FROM reward_items WHERE id=${itemId} AND owner_id=${userId} FOR UPDATE`;
   if(!item)throw new FeatureError(404,'Предмет недоступен.');if(item.consumed)return;
   if(['bronze','silver','gold'].includes(item.kind))throw new FeatureError(400,'Медаль уже показывается рядом с именем.');
   if((await tx`SELECT id FROM market_listings WHERE item_id=${itemId} AND status='open'`).length)throw new FeatureError(409,'Сначала снимите предмет с продажи.');
   const seconds=item.kind==='week'?604800:item.kind==='month'?2592000:item.kind==='year'?31536000:Number(item.seconds);
   await tx`SELECT user_id FROM wallets WHERE user_id=${userId} FOR UPDATE`;
   if(item.tier==='mini'){await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;if(item.kind==='forever')await tx`UPDATE users SET mini_until='9999-12-31T00:00:00Z' WHERE id=${userId}`;else await tx`UPDATE users SET mini_until=least('9999-12-31'::timestamptz,greatest(COALESCE(mini_until,now()),now())+${seconds}*interval '1 second') WHERE id=${userId}`;await tx`UPDATE reward_items SET consumed=true WHERE id=${itemId}`;return;}
   const [active]=await tx`SELECT plus_until>='9999-01-01'::timestamptz permanent FROM users WHERE id=${userId} FOR UPDATE`;
   if(active.permanent)throw new FeatureError(400,"У тебя уже бессрочная TELEJKA PLUS. Предмет можно продать.");
   if(item.kind==='forever')await tx`UPDATE users SET plus_until='9999-12-31T00:00:00Z' WHERE id=${userId}`;
   else await tx`UPDATE users SET plus_until=least('9999-12-31'::timestamptz,greatest(COALESCE(plus_until,now()),now())+${seconds}*interval '1 second') WHERE id=${userId}`;
   await tx`UPDATE reward_items SET consumed=true WHERE id=${itemId}`;
  });return reply({ok:true});
 }
}

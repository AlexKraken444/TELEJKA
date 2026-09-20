import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('owner recovery pins a unique existing account, retaining its identity after rename',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec(`CREATE SCHEMA telejka_auth;CREATE TABLE users(id uuid PRIMARY KEY,name text,verified boolean DEFAULT false,plus_until timestamptz,mini_until timestamptz);CREATE TABLE channels(id uuid);CREATE TABLE reward_items(id uuid);INSERT INTO users(id,name) VALUES('11111111-1111-4111-8111-111111111111','Александр Пугин'),('22222222-2222-4222-8222-222222222222','Другой пользователь');`);
  await db.exec(await readFile('db/channel-refresh.sql','utf8'));
  const owner=(await db.query<{user_id:string}>('SELECT user_id FROM telejka_auth.owner_account')).rows[0];
  assert.equal(owner.user_id,'11111111-1111-4111-8111-111111111111');
  const status=(await db.query<{verified:boolean;plus:boolean;mini:boolean}>('SELECT verified,plus_until>now() plus,mini_until>now() mini FROM users WHERE id=$1',[owner.user_id])).rows[0];
  assert.deepEqual(status,{verified:true,plus:true,mini:true});
  await db.exec("UPDATE users SET name='Другое имя' WHERE id='11111111-1111-4111-8111-111111111111';UPDATE users SET name='Александр Пугин' WHERE id='22222222-2222-4222-8222-222222222222'");
  assert.equal((await db.query<{user_id:string}>('SELECT user_id FROM telejka_auth.owner_account')).rows[0].user_id,owner.user_id);
 }finally{await db.close()}
});

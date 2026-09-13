import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studioSchema,emptyStudio} from '../lib/studio-schema';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('visual action sequences validate without executable code',()=>{
 const config={...emptyStudio,blocks:[{id:'button',type:'button',text:'Test',actions:[{type:'notice',text:'Hi'},{type:'wait',seconds:1},{type:'navigate',url:'/feed'}]}]};
 assert.equal(studioSchema.safeParse(config).success,true);
 assert.equal(studioSchema.safeParse({...config,blocks:[{...config.blocks[0],actions:[{type:'script',code:'alert(1)'}]}]}).success,false);
 assert.equal(studioSchema.safeParse({...config,blocks:[{...config.blocks[0],actions:[{type:'wait',seconds:999}]}]}).success,false);
 assert.equal(studioSchema.safeParse({...emptyStudio,overrides:[{target:'.main-content.view-feed > div:nth-child(2) > h1:nth-child(1)',x:60,y:27}]}).success,true);
});
test('existing polls retain dates and votes when becoming posts',async()=>{
 const db=await PGlite.create();try{
 for(const file of ['schema','features'])await db.exec(await readFile(new URL('../db/'+file+'.sql',import.meta.url),'utf8'));
 await db.exec('ALTER TABLE users ADD COLUMN verified boolean NOT NULL DEFAULT false');
 for(const file of ['community','social-studio'])await db.exec(await readFile(new URL('../db/'+file+'.sql',import.meta.url),'utf8'));
 const uid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333';
 await db.query("INSERT INTO users(id,name,name_key,color) VALUES($1,'Poll owner','poll owner','#fff')",[uid]);
 await db.query("INSERT INTO polls(id,owner_id,payload,option_count,created_at) VALUES($1,$2,$3,2,'2026-09-01T12:00:00Z')",[pid,uid,JSON.stringify({question:'Keep me',options:['A','B']})]);
 await db.query('INSERT INTO poll_votes VALUES($1,$2,1)',[pid,uid]);
 await db.exec(await readFile(new URL('../db/polls-inline.sql',import.meta.url),'utf8'));
 const rows=await db.query<{body:string;post_id:string;votes:number}>("SELECT p.body,pl.post_id,(SELECT count(*)::int FROM poll_votes) votes FROM posts p JOIN polls pl ON pl.post_id=p.id WHERE p.created_at='2026-09-01T12:00:00Z'");
 assert.deepEqual(rows.rows,[{body:'Keep me',post_id:pid,votes:1}]);
 }finally{await db.close()}
});

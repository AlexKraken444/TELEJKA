import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchSessionUser} from '../lib/session-user';
test('temporary auth failure preserves valid session on retry',async()=>{
 let calls=0;
 const result=await fetchSessionUser('test',(async()=>{calls++;return calls===1?new Response('unavailable',{status:503}):Response.json({id:'existing-user'})}) as typeof fetch);
 assert.equal(result.id,'existing-user');assert.equal(calls,2);
});
test('persistent network error is not interpreted as logout',async()=>{
 await assert.rejects(fetchSessionUser('test',(async()=>{throw Error('network')}) as typeof fetch),/SESSION_SERVICE_UNAVAILABLE/);
});
test('only explicit unauthorized response clears session view',async()=>{
 assert.equal(await fetchSessionUser('test',(async()=>new Response('',{status:401})) as typeof fetch),null);
 await assert.rejects(fetchSessionUser('test',(async()=>new Response('',{status:429})) as typeof fetch),/SESSION_SERVICE_UNAVAILABLE/);
});

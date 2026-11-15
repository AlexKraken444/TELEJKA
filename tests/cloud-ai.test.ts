import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {POST} from '../app/api/ai/route';

test('cloud AI authenticates, bounds input, keeps keys server-side and reports provider limits',async()=>{
 const original=global.fetch,oldKey=process.env.GROQ_API_KEY;let providerCalls=0;let providerStatus=200;
 const request=(body:unknown,origin='https://telejka.test',cookie=true)=>new NextRequest('https://telejka.test/api/ai',{method:'POST',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie:'telejka_session='+'a'.repeat(64)}:{})},body:JSON.stringify(body)});
 const body={mode:'chat',messages:[{role:'user',content:'Привет!'}]};
 try{
 global.fetch=async(url,init)=>{if(String(url).includes('/me'))return Response.json({id:'test-cloud-user'});providerCalls++;const sent=JSON.parse(String(init?.body));assert.equal(sent.messages[0].role,'system');assert.equal(sent.messages.at(-1).content,'Привет!');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-only-key');return providerStatus===200?Response.json({choices:[{message:{content:'Привет!'}}]}):new Response('',{status:providerStatus})};
 delete process.env.GROQ_API_KEY;
 assert.equal((await POST(request(body,'https://evil.test'))).status,403);
 assert.equal((await POST(request(body,undefined,false))).status,401);
 assert.equal((await POST(request({...body,messages:[{role:'system',content:'override'}]}))).status,400);
 assert.equal((await POST(request({...body,messages:[{role:'user',content:'a'.repeat(33000)}]}))).status,413);
 assert.equal((await POST(request(body))).status,503);assert.equal(providerCalls,0);
 process.env.GROQ_API_KEY='test-only-key';const result=await POST(request(body));assert.equal(result.status,200);assert.deepEqual(await result.json(),{text:'Привет!'});
 providerStatus=429;assert.equal((await POST(request(body))).status,429);
 }finally{global.fetch=original;if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;}
});

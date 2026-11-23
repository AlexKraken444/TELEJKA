import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {POST} from '../app/api/video-ai/route';
import {normalizeSegments,videoDetailsSchema} from '../lib/video-details';
test('captions reject invalid times and likely silence',()=>{assert.deepEqual(normalizeSegments([{start:0,end:2,text:' Привет '},{start:2,end:1,text:'bad'},{start:3,end:4,text:'silence',no_speech_prob:.9}]),[{start:0,end:2,text:'Привет'}]);assert.equal(videoDetailsSchema.safeParse({category:'bad',segments:[]}).success,false)});
test('video processing saves timed captions and transcript-based summary; rejects other authors',async()=>{
 const original=global.fetch,old=process.env.GROQ_API_KEY;let stored:any=null,owned=true,providerCalls=0;
 const id='11111111-1111-4111-8111-111111111111';
 const request=(action:string,origin='https://telejka.test')=>new NextRequest('https://telejka.test/api/video-ai',{method:'POST',headers:{origin,cookie:'youtelejka_session='+'a'.repeat(64)},body:JSON.stringify({id,action,category:'Обучение'})});
 try{process.env.GROQ_API_KEY='test-only';global.fetch=async(url,init)=>{const u=String(url);if(u.endsWith('/video-details')){stored=JSON.parse(String(init?.body));return Response.json({ok:true})}if(u.includes('/uploads/'))return Response.json(u.endsWith('/0')?{data:'YQ=='}:{owned,mime:'video/mp4',size:1,chunks:1,videoData:stored});providerCalls++;if(u.includes('/audio/'))return Response.json({language:'russian',segments:[{start:0,end:2,text:'Урок о деревьях.'}]});const body=JSON.parse(String(init?.body));assert.equal(body.messages[1].content,'Урок о деревьях.');return Response.json({choices:[{message:{content:'Видео рассказывает о деревьях.'}}]})};
 assert.equal((await POST(request('transcribe','https://evil.test'))).status,403);owned=false;assert.equal((await POST(request('transcribe'))).status,403);assert.equal(providerCalls,0);owned=true;
 assert.equal((await POST(request('transcribe'))).status,200);assert.equal(stored.category,'Обучение');assert.equal(stored.segments[0].end,2);
 assert.equal((await POST(request('summary'))).status,200);assert.equal(stored.summary,'Видео рассказывает о деревьях.');assert.equal(providerCalls,2);
 await POST(request('summary'));assert.equal(providerCalls,2);
 }finally{global.fetch=original;if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old}
});

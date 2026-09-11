import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {allowedPushEndpoint} from '../lib/push-validation';
test('push endpoints reject SSRF and lookalike hosts',()=>{
 for(const url of ['https://fcm.googleapis.com/fcm/send/1','https://updates.push.services.mozilla.com/wpush/v2/a','https://web.push.apple.com/a','https://wns2.notify.windows.com/a'])assert.equal(allowedPushEndpoint(url),true,url);
 for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://localhost/a','https://127.0.0.1/a','https://fcm.googleapis.com:8443/a','https://u:p@fcm.googleapis.com/a'])assert.equal(allowedPushEndpoint(url),false,url);
});
test('service worker shows generic notification and opens only local chat',async()=>{
 const handlers:Record<string,Function>={};let shown:any,opened='';let pending:Promise<unknown>=Promise.resolve();
 const self={addEventListener:(name:string,fn:Function)=>handlers[name]=fn,location:{origin:'https://telejka.vercel.app'},registration:{showNotification:async(title:string,options:any)=>{shown={title,...options}}},clients:{matchAll:async()=>[],openWindow:async(url:string)=>{opened=url}}};
 runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL});
 const id='11111111-1111-4111-8111-111111111111';
 handlers.push({data:{json:()=>({chatId:id,userId:id,messageId:id,body:'secret'})},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;
 assert.equal(shown.body,'Новое сообщение');assert.equal(shown.tag,'telejka-'+id);assert.equal(JSON.stringify(shown).includes('secret'),false);
 handlers.notificationclick({notification:{data:shown.data,close(){}},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;
 assert.equal(new URL(opened).searchParams.get('chat'),id);
 handlers.notificationclick({notification:{data:{chatId:'https://evil.test'},close(){}},waitUntil:(p:Promise<unknown>)=>pending=p});await pending;
 assert.equal(opened,'https://telejka.vercel.app/feed');
});

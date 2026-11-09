import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../app/api/you/[...path]/route';
const ctx=(...path:string[])=>({params:Promise.resolve({path})});
test('YouTelejka keeps its session independent and rejects cross-origin writes',async()=>{
 const token='a'.repeat(64),other='b'.repeat(64);
 const copy=await POST(new NextRequest('http://localhost/api/you/auth/use-telejka',{method:'POST',headers:{cookie:'telejka_session='+token}}),ctx('auth','use-telejka'));
 assert.equal(copy.status,200);assert.ok(copy.headers.get('set-cookie')?.startsWith('youtelejka_session='+token));
 const denied=await POST(new NextRequest('http://localhost/api/you/auth/use-telejka',{method:'POST',headers:{origin:'https://evil.example',cookie:'telejka_session='+token}}),ctx('auth','use-telejka'));assert.equal(denied.status,403);
 const logout=await POST(new NextRequest('http://localhost/api/you/auth/logout',{method:'POST'}),ctx('auth','logout'));assert.match(logout.headers.get('set-cookie')||'',/^youtelejka_session=/);assert.ok(!logout.headers.get('set-cookie')?.includes(' telejka_session='));
 const original=globalThis.fetch;
 globalThis.fetch=async (_url,options)=>{assert.equal(new Headers(options?.headers).get('cookie'),'telejka_session='+other);return new Response('{"id":"you"}',{headers:{'set-cookie':'telejka_session='+other+'; Path=/; HttpOnly'}})};
 try{const response=await GET(new NextRequest('http://localhost/api/you/me',{headers:{cookie:'telejka_session='+token+'; youtelejka_session='+other}}),ctx('me'));assert.equal(response.status,200);assert.match(response.headers.get('set-cookie')||'',/^youtelejka_session=/)}finally{globalThis.fetch=original}
});

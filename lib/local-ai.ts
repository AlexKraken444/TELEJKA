export type AiMessage={role:'system'|'user'|'assistant';content:string};
let active:AbortController|null=null;
export function stopAI(){active?.abort();}
export async function askAI(messages:AiMessage[],progress:(s:string)=>void,mode='chat'):Promise<string>{
 if(active)throw Error('ИИ уже занят. Дождитесь ответа или остановите его.');
 const controller=new AbortController();active=controller;const timer=setTimeout(()=>controller.abort(),55000);
 try{progress('TELEJKA AI отвечает…');const response=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:messages.filter(m=>m.role!=='system'),mode,service:location.pathname.startsWith('/youtelejka')?'you':'telejka'}),signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.error||'ИИ временно недоступен.');return result.text;
 }catch(e){if(controller.signal.aborted)throw Error('Запрос остановлен или время ожидания истекло.');throw e;}finally{clearTimeout(timer);if(active===controller)active=null;}
}
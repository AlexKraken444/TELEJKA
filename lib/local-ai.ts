export type AiMessage={role:'system'|'user'|'assistant';content:string};
let worker:Worker|null=null,pending:{id:string;resolve:(s:string)=>void;reject:(e:Error)=>void;progress:(s:string)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
export function stopAI(){worker?.terminate();worker=null;if(pending){clearTimeout(pending.timer);pending.reject(Error('Остановлено.'));pending=null}}
export function askAI(messages:AiMessage[],progress:(s:string)=>void,mode='chat'):Promise<string>{
 if(pending)return Promise.reject(Error('ИИ уже занят. Дождитесь ответа или остановите его.'));
 if(typeof Worker==='undefined')return Promise.reject(Error('Этот браузер не поддерживает локальный ИИ.'));
 return new Promise((resolve,reject)=>{try{if(!worker){worker=new Worker('/telejka-ai-worker.js',{type:'module'});worker.onmessage=({data})=>{if(!pending||pending.id!==data.id)return;if(data.status){pending.progress(data.status);return}const p=pending;pending=null;clearTimeout(p.timer);if(data.error)p.reject(Error(data.error));else p.resolve(data.text)};worker.onerror=()=>{const p=pending;pending=null;worker?.terminate();worker=null;if(p){clearTimeout(p.timer);p.reject(Error('Не удалось загрузить локальный ИИ. Проверьте соединение.'))}}}const id=crypto.randomUUID();pending={id,resolve,reject,progress,timer:setTimeout(()=>stopAI(),600000)};worker.postMessage({id,messages,mode})}catch{pending=null;reject(Error('Не удалось запустить ИИ в этом браузере.'))}})
}

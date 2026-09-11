"use client";
import {useEffect,useState} from 'react';
import {api,errorText} from './shared';
function keyBytes(key:string){const bytes=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}
async function worker(){await navigator.serviceWorker.register('/sw.js',{scope:'/'});return navigator.serviceWorker.ready}
export function PushSettings({userId}:{userId:string}){
 const [supported,setSupported]=useState(false),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[denied,setDenied]=useState(false);
 useEffect(()=>{let active=true;const valid='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;setSupported(valid);setReady(true);if(valid){setDenied(Notification.permission==='denied');worker().then(r=>r.pushManager.getSubscription()).then(s=>{if(active)setEnabled(Boolean(s)&&Notification.permission==='granted')}).catch(e=>{if(active)setError(errorText(e))})}return()=>{active=false}},[userId]);
 async function enable(){setBusy(true);setError('');try{
  // The permission prompt is initiated directly by the user's button click.
  const permission=await Notification.requestPermission();setDenied(permission==='denied');if(permission!=='granted')throw Error('Разрешите уведомления в настройках сайта и устройства.');
  const r=await worker();const {publicKey}=await api<{publicKey:string}>('push/key');
  const subscription=await r.pushManager.getSubscription()||await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
  await api('push/subscription','POST',subscription.toJSON());setEnabled(true);
 }catch(e){setError(errorText(e))}finally{setBusy(false)}}
 async function disable(){setBusy(true);setError('');try{await api('push/subscription','DELETE');const r=await worker();await (await r.pushManager.getSubscription())?.unsubscribe();setEnabled(false);}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <section className="section-pad"><div className="settings-card push-settings"><h2>Уведомления на устройстве</h2><p>Новые сообщения на экране телефона или компьютера, даже когда вкладка TELEJKA закрыта.</p>{ready&&supported?<><button className="secondary" disabled={busy} onClick={enabled?disable:enable}>{busy?'Подключаем…':enabled?'Отключить уведомления':'Включить уведомления'}</button><p className="muted small">{enabled?'Уведомления включены на этом устройстве.':denied?'Уведомления заблокированы. Разрешите их в настройках браузера.':'Браузер запросит разрешение после нажатия кнопки.'}</p></>:ready?<p>На iPhone: Safari → «Поделиться» → «На экран Домой». Открой TELEJKA с появившейся иконки. На других устройствах используй браузер с поддержкой push.</p>:<p>Проверка устройства…</p>}<p className="muted small">Если браузер принудительно остановлен или уведомления отключены системой, доставка может задержаться. Содержимое переписки не показывается на экране блокировки.</p>{error&&<p className="error" role="alert">{error}</p>}</div></section>
}
export function PushSync({userId}:{userId:string}){
 useEffect(()=>{if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)||Notification.permission!=='granted')return;let active=true;worker().then(r=>r.pushManager.getSubscription()).then(s=>{if(active&&s)return api('push/subscription','POST',s.toJSON())}).catch(()=>{});return()=>{active=false}},[userId]);return null;
}

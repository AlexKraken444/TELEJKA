"use client";
import {useEffect,useState} from 'react';
export default function ErrorPage({reset}:{error:Error;reset:()=>void}){
 const [quota,setQuota]=useState(false),[retryAt,setRetryAt]=useState(0),[now,setNow]=useState(Date.now());
 useEffect(()=>{let live=true;fetch('/api/me',{cache:'no-store'}).then(async r=>{const data=await r.json();if(!live)return;setQuota(['DATA_TRANSFER_QUOTA','RESOURCE_QUOTA'].includes(data.reason));if(r.status===503)setRetryAt(Date.now()+(Number(r.headers.get('retry-after'))||30)*1000)}).catch(()=>{});const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{live=false;clearInterval(timer)}},[]);
 const seconds=Math.max(0,Math.ceil((retryAt-now)/1000));
 return <main className="session-retry"><h1>TELEJKA временно недоступна</h1><p>{quota?'Исчерпан лимит базы данных. Для восстановления работы нужно возобновить квоту у провайдера.':'Не удалось связаться с сервером. Попробуй снова немного позже.'}</p><p>Выход из аккаунта не выполнялся. Удалять приложение или регистрироваться заново не нужно.</p><button className="primary" disabled={seconds>0} onClick={reset}>{seconds?'Повторить через '+seconds+' с':'Повторить'}</button></main>
}

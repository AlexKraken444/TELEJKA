"use client";
import {useEffect,useState} from 'react';
import {api,UserName,errorText} from './shared';
import {registerDevice} from './preferences';
import {encryptMessage,decryptMessage,type PublicDevice,type Envelope} from '@/lib/crypto-chat';
import type {User} from '@/lib/types';
export function FollowControl({target,userId}:{target:string;userId:string}){
 const [stats,setStats]=useState<{followers:number;following:number;subscribed:boolean}>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;api<any>('follows/'+target).then(v=>{if(live)setStats(v)}).catch(e=>{if(live)setError(errorText(e))});return()=>{live=false}},[target]);
 return <div className="follow-control"><span>{stats?`${stats.followers} подписчиков · ${stats.following} подписок`:'Подписчики…'}</span>{target!==userId&&stats&&<button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setStats(await api('follows/'+target,stats.subscribed?'DELETE':'POST'))}catch(e){setError(errorText(e))}finally{setBusy(false)}}}>{stats.subscribed?'Отписаться':'Подписаться'}</button>}{error&&<small role="alert">{error}</small>}</div>
}
type Content={question:string;options:string[]};
type Poll={id:string;payload:Content|Envelope;author:User;counts:Record<string,number>;choice:number|null;content?:Content};
export function InlinePoll({id,user,chatId}:{id:string;user:User;chatId?:string}){
 const [poll,setPoll]=useState<Poll>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const p=await api<Poll>('polls/'+id);const content=chatId?await decryptMessage<Content>(chatId,p.payload as Envelope,await registerDevice(user.id)):p.payload as Content;return {...p,content};}
 useEffect(()=>{let alive=true;const refresh=()=>{if(document.hidden)return;void load().then(p=>{if(alive){setPoll(p);setError('')}}).catch(e=>{if(alive)setError(errorText(e))})};refresh();const timer=setInterval(refresh,15000);return()=>{alive=false;clearInterval(timer)}},[id,chatId,user.id]);
 const total=Object.values(poll?.counts||{}).reduce((a,b)=>a+b,0);
 return <div className="inline-poll">{error&&<p role="alert" className="error">{error}</p>}{poll?.content?<><h3>{poll.content.question}</h3><div className="poll-options">{poll.content.options.map((option,i)=>{const percent=total?Math.round((poll.counts[i]||0)/total*100):0;return <button key={i} className="poll-option" aria-pressed={poll.choice===i} disabled={busy} onClick={async()=>{setBusy(true);try{await api('polls/'+id,'POST',{choice:i});setPoll(await load())}catch(e){setError(errorText(e))}finally{setBusy(false)}}}><span className="poll-fill" style={{width:percent+'%'}}/><span>{poll.choice===i?'✓ ':''}{option}</span><b>{percent}%</b></button>})}</div><small>{total} голосов · один вариант</small></>:!error&&<p>Загрузка опроса…</p>}</div>
}
export function Polls({user,chatId,authorId,readOnly=false,onCreated}:{user:User;chatId?:string;authorId?:string;readOnly?:boolean;onCreated?:()=>void}){
 const [polls,setPolls]=useState<Poll[]>([]),[creating,setCreating]=useState(false),[question,setQuestion]=useState(''),[options,setOptions]=useState(['','']),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const endpoint='polls'+(chatId?'?chat='+chatId:authorId?'?author='+authorId:'');
 async function load(){const rows=await api<Poll[]>(endpoint);const identity=chatId?await registerDevice(user.id):null;return Promise.all(rows.map(async p=>{try{return {...p,content:identity?await decryptMessage<Content>(chatId!,p.payload as Envelope,identity):p.payload as Content}}catch{return p}}));}
 async function create(){setBusy(true);setError('');try{const content={question:question.trim(),options:options.map(v=>v.trim())};let value:Content|Envelope=content;if(chatId){await registerDevice(user.id);const devices=await api<PublicDevice[]>('chats/'+chatId+'/keys');if(!devices.length)throw new Error('Участники ещё не настроили шифрование.');value=await encryptMessage(chatId,content,devices)}await api(endpoint,'POST',{payload:value,optionCount:options.length});onCreated?.();setQuestion('');setOptions(['','']);setCreating(false)}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 return <section className="polls-section" aria-label="Опросы">{!readOnly&&<button className="secondary" onClick={()=>setCreating(!creating)}>{creating?'Отменить':'Создать опрос'}</button>}{creating&&<form className="poll-editor glass-panel" onSubmit={e=>{e.preventDefault();void create()}}><label>Вопрос<input required maxLength={300} value={question} onChange={e=>setQuestion(e.target.value)}/></label>{options.map((v,i)=><label key={i}>Вариант {i+1}<input required maxLength={150} value={v} onChange={e=>setOptions(options.map((s,n)=>n===i?e.target.value:s))}/></label>)}<div className="extra-actions">{options.length<10&&<button type="button" className="secondary" onClick={()=>setOptions([...options,''])}>Добавить вариант</button>}<button disabled={busy} className="primary">Опубликовать опрос</button></div>{chatId&&<small>Вопрос и варианты зашифрованы. Сервер подсчитывает голоса.</small>}</form>}{error&&<p role="alert" className="error">{error}</p>} </section>
}

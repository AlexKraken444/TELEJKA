"use client";
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Radio,Clapperboard,Home,MessageCircle,Users,UserRound} from 'lucide-react';
export function MobileNavigation({tab,onChange}:{tab:string;onChange:(tab:'feed'|'videos'|'chats'|'people'|'profile')=>void}){
 const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
 if(!ready)return null;
 return createPortal(<nav id="telejka-mobile-navigation" aria-label="Основная навигация">{[{id:'feed',name:'Лента',icon:Home},{id:'videos',name:'Видосики',icon:Clapperboard},{id:'chats',name:'Сообщения',icon:MessageCircle},{id:'people',name:'Люди',icon:Users},{id:'profile',name:'Профиль',icon:UserRound}].map(item=><button key={item.id} aria-current={tab===item.id?'page':undefined} onClick={()=>onChange(item.id as 'feed'|'videos'|'chats'|'people'|'profile')}><item.icon size={23}/><span>{item.name}</span></button>)}</nav>,document.body);
}

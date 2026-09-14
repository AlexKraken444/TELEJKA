"use client";
import {useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {InstallApp} from './install-app';
import {PushSettings} from './push-settings';
export function InstallBanner({userId}:{userId:string}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  const mode=matchMedia('(display-mode: standalone)');
  const sync=()=>{let dismissed=false;try{dismissed=localStorage.getItem('telejka-install-dismissed')==='1'||localStorage.getItem('telejka-installed')==='1'}catch{}setVisible(!dismissed&&!mode.matches&&!Boolean((navigator as Navigator&{standalone?:boolean}).standalone));};
  const installed=()=>{try{localStorage.setItem('telejka-installed','1')}catch{}setVisible(false)};
  sync();mode.addEventListener('change',sync);window.addEventListener('appinstalled',installed);window.addEventListener('storage',sync);
  return()=>{mode.removeEventListener('change',sync);window.removeEventListener('appinstalled',installed);window.removeEventListener('storage',sync)};
 },[]);
 if(!visible)return null;
 return <div className="install-banner"><details className="feed-install feed-app-settings"><summary>Установить приложение и включить уведомления</summary><InstallApp/><PushSettings userId={userId} compact/></details><button className="install-banner-close" aria-label="Закрыть предложение установки" onClick={()=>{try{localStorage.setItem('telejka-install-dismissed','1')}catch{}setVisible(false)}}><X size={18}/></button></div>;
}

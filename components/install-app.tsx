"use client";
import {useEffect,useState} from 'react';
import {Download,Check} from 'lucide-react';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
export function InstallApp(){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false),[busy,setBusy]=useState(false),[ios,setIos]=useState(false),[desktop,setDesktop]=useState(false);
 useEffect(()=>{
  const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  setIos(apple);setDesktop(!apple&&!/Android/.test(navigator.userAgent));
  const standalone=window.matchMedia('(display-mode: standalone)');
  const sync=()=>setInstalled(standalone.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));sync();
  const before=(event:Event)=>{event.preventDefault();setPrompt(event as InstallEvent)};
  const done=()=>{setInstalled(true);setPrompt(null);setHelp(false)};
  window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);standalone.addEventListener('change',sync);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});
  return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);standalone.removeEventListener('change',sync)};
 },[]);
 async function install(){
  if(!prompt||desktop){setHelp(value=>!value);return}
  setBusy(true);try{await prompt.prompt();await prompt.userChoice;}catch{setHelp(true)}finally{setPrompt(null);setBusy(false)}
 }
 return <div className="install-app"><button type="button" className="secondary install-app-button" disabled={busy||installed} onClick={install} aria-expanded={help} aria-controls="install-app-help">{installed?<Check size={18}/>:<Download size={18}/>} {installed?'TELEJKA установлена':busy?'Открываем установку…':'Установить на телефон'}</button>{help&&<div id="install-app-help" className="install-app-help" role="status">{ios?<p>В Safari открой меню «Поделиться» → «На экран Домой» → «Добавить». Если есть переключатель «Открывать как веб-приложение», включи его. Иконка TELEJKA появится на домашнем экране.</p>:desktop?<p>Открой telejka.vercel.app на телефоне и нажми эту кнопку. На Android также можно выбрать «Установить приложение» в меню браузера, на iPhone — «Поделиться» → «На экран Домой».</p>:<p>Открой меню браузера ⋮ → «Установить приложение» или «Добавить на главный экран» и подтверди установку. Если пункта нет, открой сайт в Chrome вне встроенного браузера мессенджера.</p>}<p className="muted">Без магазина приложений. Для сообщений нужен интернет.</p><button type="button" className="text-button" onClick={()=>setHelp(false)}>Понятно</button></div>}</div>
}

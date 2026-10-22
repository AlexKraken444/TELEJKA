"use client";
import {useEffect} from "react";
export const halloweenActive=(now:number)=>now>=Date.parse('2026-10-22T00:00:00+03:00')&&now<Date.parse('2026-11-01T00:00:00+03:00');
export function SeasonalTheme(){
 useEffect(()=>{const sync=()=>{const root=document.documentElement;if(root.dataset.theme==='halloween'&&!halloweenActive(Date.now())){root.dataset.theme='light';try{localStorage.setItem('telejka-theme','light')}catch{}}root.dataset.season=root.dataset.theme==='halloween'?'halloween':''};sync();const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});const timer=setInterval(sync,1000);document.addEventListener('visibilitychange',sync);return()=>{observer.disconnect();clearInterval(timer);document.removeEventListener('visibilitychange',sync)}},[]);
 return null;
}

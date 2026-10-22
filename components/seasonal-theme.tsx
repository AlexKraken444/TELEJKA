"use client";
import {useEffect} from "react";
export const halloweenActive=(now:number)=>now>=Date.parse('2026-10-22T00:00:00+03:00')&&now<Date.parse('2026-11-01T00:00:00+03:00');
export function SeasonalTheme(){
 useEffect(()=>{const sync=()=>{document.documentElement.dataset.season=halloweenActive(Date.now())?'halloween':''};sync();const timer=setInterval(sync,30000);document.addEventListener('visibilitychange',sync);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',sync)}},[]);
 return <div className="halloween-decoration" aria-hidden="true"><span>🎃</span><span>🦇</span><span>✦</span></div>;
}

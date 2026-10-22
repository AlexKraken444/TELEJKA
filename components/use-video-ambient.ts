"use client";
import {useEffect,type RefObject} from "react";
export function useVideoAmbient(ref:RefObject<HTMLVideoElement|null>,source:string){
 useEffect(()=>{const video=ref.current;if(!video||!source)return;
 const target=video.closest<HTMLElement>('.video-feed-overlay,.post,.message')||video.parentElement;if(!target)return;
 const canvas=document.createElement('canvas');canvas.width=16;canvas.height=9;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
 let last=-1,failed=false;
 const paint=()=>{if(failed||document.hidden||video.readyState<2||last===video.currentTime)return;
 const box=video.getBoundingClientRect();if(box.bottom<0||box.top>innerHeight)return;
 try{ctx.drawImage(video,0,0,16,9);const pixels=ctx.getImageData(0,0,16,9).data;let r=0,g=0,b=0;for(let i=0;i<pixels.length;i+=4){r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2]}const n=pixels.length/4;
 target.style.setProperty('--ambient-rgb',[r,g,b].map(v=>Math.round(v/n)).join(' '));target.dataset.ambient='true';last=video.currentTime;
 }catch{failed=true}};
 const timer=setInterval(paint,400);video.addEventListener('loadeddata',paint);video.addEventListener('seeked',paint);paint();
 return()=>{clearInterval(timer);video.removeEventListener('loadeddata',paint);video.removeEventListener('seeked',paint);delete target.dataset.ambient;target.style.removeProperty('--ambient-rgb')};
 },[ref,source]);
}

import {z} from 'zod';
export const VIDEO_CATEGORIES=['Другое','Музыка','Игры','Обучение','Обзоры','Развлечения','Новости','Технологии'] as const;
export const videoDetailsSchema=z.object({category:z.enum(VIDEO_CATEGORIES),segments:z.array(z.object({start:z.number().min(0).max(86400),end:z.number().min(0).max(86400),text:z.string().max(500)}).refine(s=>s.end>s.start)).max(1500),summary:z.string().max(6000).default(''),language:z.string().max(30).default('')});
export type VideoDetails=z.infer<typeof videoDetailsSchema>;
export type Caption=VideoDetails['segments'][number];
export function normalizeSegments(input:unknown):Caption[]{if(!Array.isArray(input))return [];return input.flatMap(s=>{if(!s||typeof s.text!=='string'||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start||s.end>86400||s.no_speech_prob>0.8)return [];return [{start:s.start,end:s.end,text:s.text.trim().slice(0,500)}]}).filter(s=>s.text).sort((a,b)=>a.start-b.start).slice(0,1500)}

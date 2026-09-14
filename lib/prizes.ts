export const PRIZES = [
 {kind:'baton10',label:'10 БАТОНчиков',rarity:'Частый',icon:'🥖'},
 {kind:'baton30',label:'30 БАТОНчиков',rarity:'Частый',icon:'🥖'},
 {kind:'week',label:'TELEJKA+ на неделю',rarity:'Средний',icon:'✦'},
 {kind:'month',label:'TELEJKA+ на месяц',rarity:'Средний',icon:'✦'},
 {kind:'year',label:'TELEJKA+ на год',rarity:'Редкий',icon:'✦'},
 {kind:'forever',label:'TELEJKA+ навсегда',rarity:'Легендарный',icon:'∞'},
 {kind:'bronze',label:'Бронзовая медаль',rarity:'Легендарный',icon:'🥉'},
 {kind:'silver',label:'Серебряная медаль',rarity:'Легендарный',icon:'🥈'},
 {kind:'gold',label:'Золотая медаль',rarity:'???',icon:'🥇'},
] as const;
export type PrizeKind=typeof PRIZES[number]['kind'];
// Integer weights always total 100,000. Published in the UI before a spin.
export function prizeWeights(stake:number){
 const t=(Math.max(10,Math.min(1000,stake))-10)/990;
 const low=[65000,28000,4000,2200,600,80,70,40,10];
 const high=[25000,30000,20000,14000,6500,1600,1500,1100,300];
 const weights=low.map((n,i)=>Math.round(n+(high[i]-n)*t));
 weights[0]+=100000-weights.reduce((a,b)=>a+b,0);return weights;
}
export function pickPrize(stake:number,roll:number):PrizeKind{
 let total=0;const weights=prizeWeights(stake);
 for(let i=0;i<weights.length;i++){total+=weights[i];if(roll<total)return PRIZES[i].kind}
 throw new Error('Invalid prize roll');
}
export const medalIcons:Record<string,string>={bronze:'🥉',silver:'🥈',gold:'🥇'};
export function itemLabel(kind:string,seconds?:number){return PRIZES.find(p=>p.kind===kind)?.label||(kind==='time'?`TELEJKA+ · ${Math.ceil((seconds||0)/86400)} дн.`:kind)}

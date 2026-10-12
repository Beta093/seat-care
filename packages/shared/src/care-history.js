import {dateKey} from './sensor-history.js';
export function emptyCareHistory(){return {version:1,events:[],days:{},settings:{}};}
export function restoreCareHistory(value,source){
 const out=emptyCareHistory();if(value?.version!==1)return out;
 out.events=(Array.isArray(value.events)?value.events:[]).filter(e=>e&&typeof e.id==='string'&&typeof e.type==='string'&&Number.isFinite(e.at)&&e.source===source).slice(-20000);
 if(value.days&&typeof value.days==='object')for(const [key,day] of Object.entries(value.days)){if(!/^\d{4}-\d{2}-\d{2}$/.test(key))continue;out.days[key]=Object.fromEntries(['seated','unregistered','unloaded'].map(k=>[k,Number.isFinite(day?.[k])&&day[k]>=0?day[k]:0]));}
 out.settings=value.settings&&typeof value.settings==='object'?value.settings:{};return pruneCareHistory(out);
}
export function observeCare(history,{from,to,kind}){
 if(!['seated','unregistered','unloaded'].includes(kind)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>2000)return;
 // Split observed intervals at local midnight, keeping event timestamps intact.
 while(from<to){const date=dateKey(from),next=new Date(from);next.setHours(24,0,0,0);const end=Math.min(to,next.getTime()),day=history.days[date]??={seated:0,unregistered:0,unloaded:0};day[kind]+=end-from;from=end;}
}
export function pruneCareHistory(history,now=Date.now()){
 const cutoff=new Date(now);cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-89);
 history.events=history.events.filter(e=>e.at>=cutoff.getTime()).slice(-20000);
 for(const key of Object.keys(history.days))if(key<dateKey(cutoff.getTime()))delete history.days[key];return history;
}
export function careDay(history,date){
 const events=history.events.filter(e=>dateKey(e.at)===date),complete=events.filter(e=>e.type==='relief_completed');
 return {...(history.days[date]||{seated:0,unregistered:0,unloaded:0}),events,completed:complete.length,heldMs:complete.reduce((s,e)=>s+(e.observedMs||0),0),interrupted:events.filter(e=>e.type==='relief_interrupted').length};
}

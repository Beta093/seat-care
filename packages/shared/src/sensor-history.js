import {assess,STATES} from './sensor.js';
export const dateKey = at => {const d=new Date(at);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const empty=()=>Object.fromEntries(Object.keys(STATES).map(k=>[k,0]));
export function addSample(records,{at,values,source='sensor',device='unknown',careLabel=null,baselineId=null}) {
 if(!Number.isFinite(at))return;const key=dateKey(at),second=Math.floor(at/1000),d=new Date(at),slot=Math.floor(at/5000);
 const record=records[key]??={date:key,hours:Array.from({length:24},empty),frames:[],lastSecond:null,lastSlot:null};
 if(record.lastSecond!==null&&second<=record.lastSecond)return;
 const lean=values?assess(values).lean:'unavailable';record.hours[d.getHours()][lean]++;record.lastSecond=second;
 if(slot!==record.lastSlot){record.lastSlot=slot;record.frames.push({at,values:lean==='unavailable'?null:[...values],source,device,careLabel,baselineId});}
}
export function pruneHistory(records,now=Date.now()) {
 const d=new Date(now);d.setHours(0,0,0,0);const cutoff=new Date(d);cutoff.setDate(cutoff.getDate()-89);const frames=new Date(d);frames.setDate(frames.getDate()-6);
 for(const [key,record] of Object.entries(records)){if(key<dateKey(cutoff))delete records[key];else if(key<dateKey(frames))record.frames=[];}return records;
}
export function summary(record){const counts=empty();for(const hour of record?.hours??[])for(const key of Object.keys(counts))counts[key]+=Number(hour[key])||0;const measured=['center','left','right','front','back'].reduce((s,k)=>s+counts[k],0);return {...counts,measured,score:measured?Math.round(counts.center/measured*100):null,total:Object.values(counts).reduce((a,b)=>a+b,0)};}
export function loadHistory(storage,key){try{const data=JSON.parse(storage.getItem(key)||'{}'),out={};for(const [date,r] of Object.entries(data)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(r.hours)||r.hours.length!==24)continue;out[date]={date,hours:r.hours.map(h=>Object.fromEntries(Object.keys(STATES).map(k=>[k,Number.isSafeInteger(h[k])&&h[k]>=0?h[k]:0]))),frames:(Array.isArray(r.frames)?r.frames:[]).filter(f=>Number.isFinite(f.at)&&(!f.values||assess(f.values).lean!=='unavailable')).slice(-17280),lastSecond:null,lastSlot:null};}return pruneHistory(out);}catch{return {};}}

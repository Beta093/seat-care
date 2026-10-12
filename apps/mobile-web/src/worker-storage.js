// IndexedDB stores multi-day frames without localStorage's small synchronous quota.
let opening;
function database(){
 if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open('seat-care-sensor-history',1);request.onupgradeneeded=()=>request.result.createObjectStore('histories');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{opening=null;reject(request.error);};request.onblocked=()=>reject(Error('기록 저장소가 다른 창에서 사용 중이에요.'));});
 return opening;
}
export async function readRecords(key){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('histories','readonly'),request=tx.objectStore('histories').get(key);request.onsuccess=()=>resolve(request.result||{});request.onerror=()=>reject(request.error);});}
export async function writeRecords(key,records){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('histories','readwrite');tx.objectStore('histories').put(records,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}

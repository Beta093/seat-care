// Offline synthetic files; no server requests and no participant data.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRecorder} from '../packages/shared/src/recording.js';
import {createMonitor,command,tick} from '../packages/shared/src/monitor.js';
const legacyRoot=process.argv[2];if(!legacyRoot)throw Error('Pass the preserved pre-layout-v2 project directory');
const legacyRecorderPath=resolve(legacyRoot,'packages/shared/src/recording.js');
const legacy=await import(pathToFileURL(legacyRecorderPath));
const legacyMonitor=await import(pathToFileURL(resolve(legacyRoot,'packages/shared/src/monitor.js')));
function generate(recorderFactory,monitor,actions){let now=0,state=monitor.createMonitor(0);const recorder=recorderFactory(()=>now,()=>0);recorder.start(state);for(let i=1;i<=60;i++){now=i*300;if(actions[i])state=monitor.command(state,actions[i],now);else monitor.tick(state,.3,now);recorder.capture(state);}recorder.stop();return recorder.snapshot();}
const v1=generate(legacy.createRecorder,legacyMonitor,{15:'caution',30:'warning',45:'normal'});
if(v1.version!==1||v1.layout)throw Error('Provided legacy writer did not produce an original v1 file');
const v2=generate(createRecorder,{createMonitor,command,tick},{15:'pattern-right',30:'pattern-center-rear',45:'pattern-reference'});
const wrongId=structuredClone(v2);wrongId.layout.id='demo-five-v1';
const wrongPoint=structuredClone(v2);wrongPoint.layout.points.C1.y=.5;
const files={'legacy-v1-demo.json':v1,'adopted-v2-demo.json':v2,'invalid-v2-layout-id.json':wrongId,'invalid-v2-c1-position.json':wrongPoint};
const root=new URL('../docs/fixtures/',import.meta.url);await mkdir(root,{recursive:true});const hashes={};
for(const [name,data]of Object.entries(files)){const bytes=JSON.stringify(data,null,2)+'\n';await writeFile(new URL(name,root),bytes);hashes[name]=createHash('sha256').update(bytes).digest('hex');}
await writeFile(new URL('provenance.json',root),JSON.stringify({synthetic:true,personalData:false,legacyWriter:'seat-care-before-layout-v2/packages/shared/src/recording.js',legacyWriterSha256:createHash('sha256').update(await readFile(legacyRecorderPath)).digest('hex'),durationMs:18000,frames:61,files:hashes},null,2)+'\n');
console.log('Wrote four synthetic fixtures (61 frames / 18 seconds) and provenance. Original v1 writer used.');

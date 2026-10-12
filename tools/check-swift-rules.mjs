// Runs actual production Swift rule definitions using the macOS Swift toolchain.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const source=await readFile('ios/App/App/AppDelegate.swift','utf8');const rules=source.slice(source.indexOf('struct SensorRules'),source.indexOf('final class NativeSensorHistory'));
const checks=`
let cases: [([Double], Int)] = [([100,100,100,100,100],0),([220,80,220,80,100],1),([80,220,80,220,100],2),([220,220,70,70,70],3),([70,70,200,200,200],4),([5,5,5,5,5],5)]
for (values, expected) in cases { precondition(SensorRules.assess(values) == expected) }
precondition(SensorRules.parse("P:1,2,3,4,") == nil)
precondition(SensorRules.parse("P:1,2,3,4,65536") == nil)
precondition(SensorRules.parse("P:1,2,3,4,5") == [1,2,3,4,5])
let tracker = SensorAlertTracker()
for i in 0..<60 { precondition(!tracker.update(1,Double(i)/20,true)) }
precondition(tracker.update(1,3,true))
precondition(!tracker.update(1,4,true))
precondition(!tracker.update(2,8,true))
precondition(!tracker.update(2,12,true))
precondition(!tracker.update(2,15,false))
print("Swift production posture, parser, continuity and cooldown checks passed")
`;
const dir=await mkdtemp(join(tmpdir(),'seat-swift-'));try{await writeFile(join(dir,'Rules.swift'),'import Foundation\n'+rules+checks);const r=spawnSync('swift',[join(dir,'Rules.swift')],{stdio:'inherit',env:{...process.env,CLANG_MODULE_CACHE_PATH:join(dir,'cache'),SWIFT_MODULECACHE_PATH:join(dir,'cache')}});if(r.status!==0)process.exitCode=r.status||1;}finally{await rm(dir,{recursive:true,force:true});}

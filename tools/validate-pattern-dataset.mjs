import {readFile,stat} from 'node:fs/promises';
import {evaluatePatternDataset} from '../packages/shared/src/pattern-dataset.js';
try{
 const path=process.argv[2];if(!path)throw Error('Usage: node tools/validate-pattern-dataset.mjs <local.json>');
 if((await stat(path)).size>16*1024*1024)throw Error('Dataset exceeds 16 MiB');
 console.log(JSON.stringify(evaluatePatternDataset(JSON.parse(await readFile(path,'utf8'))),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}

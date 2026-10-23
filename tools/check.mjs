import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const generated=new Set(['.dart_tool','build','node_modules','.gradle','Pods','.symlinks']);
async function check(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory()){if(!generated.has(entry.name))await check(path);}else if(/\.(mjs|js)$/.test(path)){const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(result.status)process.exit(result.status);}}}
for(const dir of ['api','apps','packages','tools'])await check(dir);
console.log('All JavaScript syntax checks passed.');

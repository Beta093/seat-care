import {build} from 'esbuild';
import {mkdir,cp,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const adminOnly=process.env.SEAT_SITE==='admin';
await rm('dist',{recursive:true,force:true});await mkdir('dist/src',{recursive:true});
const config={apiKey:process.env.FIREBASE_API_KEY||'',authDomain:process.env.FIREBASE_AUTH_DOMAIN||'',projectId:process.env.FIREBASE_PROJECT_ID||'',appId:process.env.FIREBASE_APP_ID||''};
if(!adminOnly){
 await cp('apps/mobile-web/index.html','dist/index.html');
 for(const file of ['styles.css','worker.css'])await cp(`apps/mobile-web/src/${file}`,`dist/src/${file}`);
 for(const file of ['favicon.svg','manifest.webmanifest','sw.js','icon-192.png','icon-512.png'])await cp(`apps/mobile-web/${file}`,`dist/${file}`);
 await build({entryPoints:['apps/mobile-web/src/worker.js'],bundle:true,outfile:'dist/src/worker.js',format:'esm',target:['es2022'],minify:true,define:{SEAT_FIREBASE_CONFIG:JSON.stringify(config)},legalComments:'eof'});
}
const adminDir=adminOnly?'dist':'dist/admin',adminPrefix=adminOnly?'':'/admin';
await mkdir(`${adminDir}/src`,{recursive:true});
let html=await readFile('apps/admin-web/index.html','utf8');
html=html.replaceAll('href="/src/','href="'+adminPrefix+'/src/').replaceAll('src="/src/','src="'+adminPrefix+'/src/').replace('화면 시연 중','원격 공유 미연결').replace('근로자 모바일 앱의 시연 상태를 표시합니다.','실제 센서 0대 · 가상 시연은 이 브라우저 안에서만 동작합니다.');
const workerUrl=process.env.SEAT_WORKER_URL||(!adminOnly?'/':null);
if(workerUrl&&(/^(https:\/\/[^"<>]+|\/)$/).test(workerUrl))html=html.replace('</nav>',`</nav><a class="hosted-worker-link" href="${workerUrl}">근로자 웹 ↗</a>`);
await writeFile(`${adminDir}/index.html`,html);await cp('apps/admin-web/src/styles.css',`${adminDir}/src/styles.css`);await cp('apps/admin-web/favicon.svg',`${adminDir}/favicon.svg`);
await build({entryPoints:['apps/admin-web/src/app.js'],bundle:true,outfile:`${adminDir}/src/app.js`,format:'esm',target:['es2022'],minify:true,define:{SEAT_HOSTED_ADMIN:'true'},plugins:[{name:'hosted-admin',setup(builder){builder.onResolve({filter:/^\/shared\//},args=>({path:args.path==='/shared/client.js'?resolve('apps/admin-web/src/hosted-client.js'):resolve('packages/shared/src',args.path.slice(8))}));}}]});
await mkdir('dist/licenses',{recursive:true});await cp('vendor/esp32_telecommunication/LICENSE','dist/licenses/esp32_telecommunication.txt');
await mkdir('dist/rehearsal',{recursive:true});
await cp('apps/rehearsal/index.html','dist/rehearsal/index.html');
await cp('apps/rehearsal/style.css','dist/rehearsal/style.css');
await cp('apps/mobile-web/favicon.svg','dist/rehearsal/favicon.svg');
await cp('apps/rehearsal/viewer.css','dist/rehearsal/viewer.css');
await mkdir('dist/rehearsal/assets',{recursive:true});
for(const [source,target] of [['apps/mobile-web/src/styles.css','worker-base.css'],['apps/mobile-web/src/worker.css','worker.css'],['apps/admin-web/src/styles.css','admin.css']])await cp(source,`dist/rehearsal/assets/${target}`);
await build({loader:{'.html':'text'},entryPoints:['apps/rehearsal/app.js'],bundle:true,outfile:'dist/rehearsal/app.js',format:'esm',target:['es2022'],minify:true});
await mkdir('dist/sensor',{recursive:true});
for(const file of ['index.html','style.css'])await cp(`apps/admin-web/sensor/${file}`,`dist/sensor/${file}`);
await build({entryPoints:['apps/admin-web/sensor/app.js'],bundle:true,outfile:'dist/sensor/app.js',format:'esm',target:['es2022'],minify:true});
// Keep the original dashboard intact and expose the separate real-data view.
const adminHtml=await readFile(`${adminDir}/index.html`,'utf8');
await writeFile(`${adminDir}/index.html`,adminHtml.replace('</nav>','<a href="/sensor/">실제 센서 공유</a></nav>'));
console.log(`Vercel assets ready: dist/ (${adminOnly?'admin':'worker + admin'})`);

import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const output = new URL('dist/', import.meta.url);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, stdio: 'inherit'});
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
await run('flutter', ['build', 'web', '--base-href', '/user/', '--output', '../dist/user'], new URL('user-flutter/', import.meta.url));

// Flutter's generated entrypoint filenames are stable across releases. Give
// them a release-specific URL so a previously cached app cannot hide a newly
// deployed UI or keep an outdated tree-shaken icon font in use.
const release = Date.now().toString(36);
const userOutput = new URL('user/', output);
const indexUrl = new URL('index.html', userOutput);
const bootstrapUrl = new URL('flutter_bootstrap.js', userOutput);
const index = await readFile(indexUrl, 'utf8');
const bootstrap = await readFile(bootstrapUrl, 'utf8');
await writeFile(
  indexUrl,
  index.replace(
    'src="flutter_bootstrap.js"',
    `src="flutter_bootstrap.js?v=${release}"`,
  ),
);
await writeFile(
  bootstrapUrl,
  bootstrap.replace('"mainJsPath":"main.dart.js"', `"mainJsPath":"main.dart.js?v=${release}"`),
);

await cp(new URL('admin-web/', import.meta.url), new URL('admin/', output), {recursive: true});
console.log('Firebase Hosting build complete: /user and /admin');

import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import assert from 'node:assert/strict';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
for(const file of [...files('src'),...files('scripts'),...files('public'),...files('tests')].filter(f=>f.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
const spec=JSON.parse(readFileSync('openapi.json'));assert.equal(spec.openapi,'3.1.0');assert(Object.keys(spec.paths).length>=8);
assert(!readFileSync('.gitignore','utf8').split('\n').some(x=>x.trim()==='.env'));
console.log('Синтаксис JS, OpenAPI JSON и .gitignore: OK');

import {readFileSync, existsSync} from 'node:fs';
import {configuration} from '../src/config.js';
import {sourceChecksum} from './checksum.js';
import {createHash} from 'node:crypto';

const failures=[];
const sourceOnly=process.argv.includes('--source-only');
const withoutPresentation=process.argv.includes('--without-presentation');
let config;
if(!sourceOnly)try { config=configuration(); } catch(e) { failures.push(e.message); }
if(config){
  if(!config.token)failures.push('Не задан BOT_TOKEN');
  if(!config.botUsername)failures.push('Не задан BOT_USERNAME');
  if(config.demo)failures.push('Для сдачи требуется DEMO_MODE=false');
  if(config.botMode!=='webhook')failures.push('Для опубликованной версии требуется BOT_MODE=webhook');
  if(!config.publicUrl.startsWith('https://'))failures.push('PUBLIC_URL должен использовать HTTPS');
}
const submission=JSON.parse(readFileSync('docs/submission.json'));
for(const key of ['botUrl','apiUrl','repositoryOrArchive','checksumOrCommit','team'])if(!submission[key])failures.push('Не заполнено docs/submission.json: '+key);
if(submission.checksumOrCommit?.startsWith('source-sha256:') && submission.checksumOrCommit!=='source-sha256:'+sourceChecksum())failures.push('Контрольная сумма исходников не совпадает с docs/submission.json');
const spec=JSON.parse(readFileSync('openapi.json'));
if(spec.servers.some(s=>s.url.includes('REPLACE')))failures.push('В openapi.json остался шаблон адреса');
if(readFileSync('DATA-API.yaml','utf8').includes('REPLACE-WITH'))failures.push('В DATA-API.yaml остался шаблон адреса');
if(!sourceOnly && submission.deploymentVerified!==true)failures.push('Не подтверждена проверка развёрнутой версии: deploymentVerified');
if(!withoutPresentation && !existsSync('docs/presentation.pdf'))failures.push('Нет PDF-презентации');
for(const file of ['Dockerfile','compose.yaml','.dockerignore','.env.example','package-lock.json','README.md','DATA-API.yaml','data/demo-profiles.json'])if(!existsSync(file))failures.push('Нет файла '+file);
if(existsSync('MANIFEST.sha256'))for(const line of readFileSync('MANIFEST.sha256','utf8').trim().split('\n')) {
  const match=line.match(/^([a-f0-9]{64})  (.+)$/);
  if(!match || !existsSync(match[2]) || createHash('sha256').update(readFileSync(match[2])).digest('hex')!==match[1])failures.push('Не совпала запись MANIFEST.sha256: '+(match?.[2] || 'формат'));
}else failures.push('Нет MANIFEST.sha256');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(sourceOnly?'Исходники, комплектность и контрольные суммы: OK. Развёртывание проверяется отдельно.':'Реквизиты заполнены. Фактическая проверка MAX и Docker отмечается в docs/JUDGE-CHECKLIST.md.');

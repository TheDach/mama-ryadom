import {readFileSync, existsSync} from 'node:fs';
import {configuration} from '../src/config.js';

const failures=[];
let config;
try { config=configuration(); } catch(e) { failures.push(e.message); }
if(config){
  if(!config.token)failures.push('Не задан BOT_TOKEN');
  if(!config.botUsername)failures.push('Не задан BOT_USERNAME');
  if(config.demo)failures.push('Для сдачи требуется DEMO_MODE=false');
  if(config.botMode!=='webhook')failures.push('Для опубликованной версии требуется BOT_MODE=webhook');
  if(!config.publicUrl.startsWith('https://'))failures.push('PUBLIC_URL должен использовать HTTPS');
}
const submission=JSON.parse(readFileSync('docs/submission.json'));
for(const key of ['botUrl','apiUrl','repositoryOrArchive','checksumOrCommit','team'])if(!submission[key])failures.push('Не заполнено docs/submission.json: '+key);
const spec=JSON.parse(readFileSync('openapi.json'));
if(spec.servers.some(s=>s.url.includes('REPLACE')))failures.push('В openapi.json остался шаблон адреса');
if(readFileSync('DATA-API.yaml','utf8').includes('REPLACE-WITH'))failures.push('В DATA-API.yaml остался шаблон адреса');
if(submission.deploymentVerified!==true)failures.push('Не подтверждена проверка развёрнутой версии: deploymentVerified');
if(!existsSync('docs/presentation.pdf'))failures.push('Нет PDF-презентации');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log('Реквизиты заполнены. Фактическая проверка MAX и Docker отмечается в docs/JUDGE-CHECKLIST.md.');

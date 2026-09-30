import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Store} from '../src/storage/database.js';
import {Profiles} from '../src/services/profile.js';
import {Bot} from '../src/max/bot.js';
import {createApp} from '../src/http/server.js';
import {configuration} from '../src/config.js';
import {questionPath} from '../src/domain/questionnaire.js';

const local=process.argv.includes('--local'),demo=local || process.argv.includes('--demo');
let server,store,base=process.argv.find((a,i)=>i>1 && !a.startsWith('--')),token,state;
const spec=JSON.parse(readFileSync(new URL('../openapi.json',import.meta.url)));
async function request(path,method='GET',body,status=200) {
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,status,`${method} ${path}: HTTP ${res.status}, ожидался ${status}`);
  assert.match(res.headers.get('Content-Type') || '',/^application\/json/);
  return res.json();
}
function checkState(value) {
  for(const key of spec.components.schemas.State.required)assert.ok(Object.hasOwn(value,key),'Нет поля '+key);
  assert.ok(Number.isInteger(value.version));assert.ok(Array.isArray(value.benefits));
  for(const b of value.benefits) {
    for(const key of spec.components.schemas.Benefit.required)assert.ok(Object.hasOwn(b,key),'Нет поля карточки '+key);
    assert.equal(b.testData,true);assert.ok(spec.components.schemas.Benefit.properties.match.enum.includes(b.match));
  }
  state=value;return value;
}
try {
  if(local) {
    store=new Store(':memory:');const profiles=new Profiles(store),config=configuration({DEMO_MODE:'true'});
    const bot=new Bot(store,profiles,config);server=createApp({config,store,profiles,bot,client:{send:async()=>{}}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;config.publicUrl=base;
  }
  if(!base || !/^https?:\/\//.test(base))throw new Error('Укажите адрес API или --local');
  base=base.replace(/\/$/,'');
  if(!demo && !process.env.MAX_INIT_DATA)throw new Error('Для MAX-входа передайте MAX_INIT_DATA из тестового аккаунта; для локального демо используйте --demo');
  const health=await request('/api/health');assert.equal(health.status,'ok');console.log('health: OK');
  await request('/api/state','GET',undefined,401);
  const auth=await request('/api/auth','POST',demo?{demo:true}:{initData:process.env.MAX_INIT_DATA});
  assert.equal(typeof auth.token,'string');token=auth.token;checkState(await request('/api/state'));
  assert.ok(!state.profile.stage && !state.reminders.length && !Object.keys(state.tracking).length,'Используйте отдельный пустой тестовый профиль: проверка изменяет и удаляет его');
  const other=demo?await request('/api/auth','POST',{demo:true}):null;
  checkState(await request('/api/questionnaire','PUT',{action:'start',consent:true,version:state.version}));
  const answers={stage:'pregnant',pregnancyWeeks:'30plus',children:'1',firstChild:'yes',employment:'employed',citizenship:'yes',registration:'permanent',income:'low',received:[]};
  let steps=0;
  while(state.questionnaire) {
    const q=questionPath(state.draft)[state.questionIndex];
    const value=q.fields.length===2?q.fields.map(k=>answers[k]).join('_'):answers[q.fields[0]];
    assert.notEqual(value,undefined,'Не задан тестовый ответ для '+q.id);
    checkState(await request('/api/questionnaire','PUT',{action:'answer',flow:state.flow,questionId:q.id,value,version:state.version}));
    assert.ok(++steps<=7);
  }
  assert.equal(state.profile.stage,'pregnant');assert.equal(state.next.id,'b01');console.log('questionnaire: OK');
  checkState(await request('/api/profile','PUT',{profile:state.profile,consent:true,version:state.version}));
  const version=state.version;
  await request('/api/tracking/b01','PUT',{status:'toString',version},400);
  checkState(await request('/api/tracking/b01','PUT',{status:'planned',version}));
  await request('/api/tracking/b01','PUT',{status:'preparing',version},409);console.log('tracking and conflicts: OK');
  checkState(await request('/api/profile','PUT',{settings:{unfinished:true},version:state.version}));
  checkState(await request('/api/reminders','POST',{benefitId:'b01',kind:'unfinished',dueAt:new Date(Date.now()+3600000).toISOString(),version:state.version}));
  assert.equal(state.reminders.length,1);
  checkState(await request('/api/reminders','POST',{deleteId:state.reminders[0].id,version:state.version}));console.log('settings and reminders: OK');
  if(other) {
    const currentToken=token;token=other.token;const isolated=await request('/api/state');assert.ok(!isolated.profile.stage);await request('/api/state','DELETE');token=currentToken;
    console.log('session isolation: OK');
  }
  assert.equal((await request('/api/state','DELETE')).deleted,true);
  await request('/api/state','GET',undefined,401);console.log('deletion and session revocation: OK');
  console.log('Проверка API завершена');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{if(server)await new Promise(r=>server.close(r));store?.close();}

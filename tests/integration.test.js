import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/storage/database.js';
import {Profiles} from '../src/services/profile.js';
import {Bot} from '../src/max/bot.js';
import {sendDueReminders} from '../src/max/worker.js';
import {createApp} from '../src/http/server.js';
import {configuration} from '../src/config.js';
const profile={stage:'under18',firstChild:'yes',children:'1',employment:'employed',income:'low',citizenship:'yes',registration:'permanent',received:[]};
function context(){const store=new Store(':memory:'),profiles=new Profiles(store),config=configuration({DEMO_MODE:'true',BOT_USERNAME:'test_bot'}),bot=new Bot(store,profiles,config);return {store,profiles,config,bot};}
test('bot complete flow and mini app share state; stale and duplicate callbacks safe',()=>{
 const c=context();let count=0;
 const update=payload=>({update_type:'message_callback',callback:{user:{user_id:42},callback_id:'cb'+ ++count,payload}});
 c.bot.handle({update_type:'bot_started',timestamp:1,user:{user_id:42}});
 c.bot.handle(update('begin'));c.bot.handle(update('consent'));
 for(const value of ['under18','yes','1','employed','low','yes','permanent','done']){const u=c.store.ensure('max:42');c.bot.handle(update(`a:${u.flow}:${u.questionIndex}:${value}`));}
 let v=c.profiles.view('max:42');assert.deepEqual(v.profile,profile);assert.equal(v.questionnaire,false);
 c.profiles.track('max:42','b02','received',v.version);
 const result=c.bot.handle(update('result'));assert.match(result.message.text,/Оформлено: 1/);
 const stale=update('a:wrong:0:pregnant');c.bot.handle(stale);const before=c.store.ensure('max:42').version;c.bot.handle(stale);assert.equal(c.store.ensure('max:42').version,before);assert.equal(c.store.ensure('max:42').profile.stage,'under18');c.store.close();
});
test('bot draft resumes after start',()=>{const c=context();c.bot.handle({user:{user_id:42},timestamp:1});c.bot.handle({callback:{user:{user_id:42},callback_id:'x',payload:'consent'}});const u=c.store.ensure('max:42');c.bot.handle({callback:{user:{user_id:42},callback_id:'y',payload:`a:${u.flow}:0:pregnant`}});const r=c.bot.handle({callback:{user:{user_id:42},callback_id:'z',payload:'begin'}});assert.match(r.message.text,/Вопрос 2 из 8/);c.store.close();});
test('SQLite persists profile across restart and rejects stale writes',()=>{const dir=mkdtempSync(join(tmpdir(),'mama-'));try{let s=new Store(join(dir,'data.sqlite'));let u=s.ensure('demo:x');u.profile=profile;s.save('demo:x',u);assert.throws(()=>s.save('demo:x',u),/изменились/);s.close();s=new Store(join(dir,'data.sqlite'));assert.deepEqual(s.ensure('demo:x').profile,profile);s.close();}finally{rmSync(dir,{recursive:true,force:true});}});
test('reminders opt-in, retry and send once; delete revokes sessions',async()=>{const c=context();let u=c.store.ensure('max:42');u.botConnected=true;u.botUserId=42;u.settings.unfinished=true;u.reminders=[{id:'r',benefitId:'b01',kind:'unfinished',dueAt:new Date(0).toISOString(),attempts:0}];c.store.save('max:42',u);let calls=0;const client={send:async()=>{calls++;}};assert.equal(await sendDueReminders(c.store,client),1);assert.equal(await sendDueReminders(c.store,client),0);assert.equal(calls,1);const token=c.store.session('max:42',60);c.store.delete('max:42');assert.equal(c.store.authenticate(token),undefined);c.store.close();});
test('disabled reminders not sent and errors scheduled for retry',async()=>{const c=context();let u=c.store.ensure('max:42');u.botConnected=true;u.botUserId=42;u.reminders=[{id:'r',benefitId:'b01',kind:'unfinished',dueAt:new Date(0).toISOString(),attempts:0}];c.store.save('max:42',u);const client={send:async()=>{throw new Error('offline');}};assert.equal(await sendDueReminders(c.store,client),0);u=c.store.ensure('max:42');u.settings.unfinished=true;c.store.save('max:42',u);await sendDueReminders(c.store,client);assert(c.store.ensure('max:42').reminders[0].retryAt>Date.now());c.store.close();});
test('API authenticates, isolates sessions, validates input, guards versions, serves routes',async()=>{
 const c=context(),server=createApp({...c,client:{send:async()=>{}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,method='GET',body,token)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:r.headers.get('Content-Type').includes('json')?await r.json():await r.text()};};
 try {
  assert.equal((await request('/api/state')).status,401);
  const a=(await request('/api/auth','POST',{demo:true})).body.token,b=(await request('/api/auth','POST',{demo:true})).body.token;
  const state=(await request('/api/state','GET',null,a)).body;
  assert.equal((await request('/api/profile','PUT',{profile,version:state.version},a)).status,400);
  let r=await request('/api/profile','PUT',{profile,consent:true,version:state.version},a);assert.equal(r.status,200);assert.equal(r.body.profile.stage,'under18');
  assert.equal((await request('/api/profile','PUT',{profile,consent:true,version:state.version},a)).status,409);
  assert.equal((await request('/api/state','GET',null,b)).body.profile.stage,undefined);
  assert.equal((await request('/api/tracking/b01','PUT',{status:'bad',version:r.body.version},a)).status,400);
  assert.equal((await request('/api/tracking/b01','PUT',{status:'planned',version:r.body.version},a)).status,200);
  assert.equal((await request('/benefits/b01')).status,200);
  assert.equal((await request('/.env')).status,404);
  assert.equal((await request('/api/state','DELETE',null,a)).status,200);
  assert.equal((await request('/api/state','GET',null,a)).status,401);
 }finally{await new Promise(r=>server.close(r));c.store.close();}
});
test('production refuses demo authentication and invalid webhook secret',async()=>{const c=context();c.config.demo=false;c.config.botMode='webhook';c.config.token='test';c.config.webhookSecret='x'.repeat(32);const server=createApp({...c,client:{send:async()=>{}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;try{assert.equal((await fetch(url+'/api/auth',{method:'POST',body:'{"demo":true}'})).status,401);assert.equal((await fetch(url+'/api/max/webhook',{method:'POST',body:'{}'})).status,401);}finally{await new Promise(r=>server.close(r));c.store.close();}});
test('duplicate employer card updates canonical tracker',()=>{const c=context();const u=c.store.ensure('demo:x');let v=c.profiles.track('demo:x','b17','planned',u.version);assert.equal(v.tracking.b01.status,'planned');assert.equal(v.benefits.find(b=>b.id==='b17').tracking.status,'planned');c.store.close();});
test('bot result changes after mini app profile update',()=>{const c=context();c.bot.handle({update_type:'bot_started',timestamp:1,user:{user_id:77}});let u=c.store.ensure('max:77');c.profiles.update('max:77',{profile:{...profile,stage:'pregnant'},consent:true},u.version);let next=c.bot.handle({callback:{user:{user_id:77},callback_id:'next-1',payload:'next'}});assert.match(next.message.text,/беременности и родам/);u=c.store.ensure('max:77');c.profiles.update('max:77',{profile},u.version);next=c.bot.handle({callback:{user:{user_id:77},callback_id:'next-2',payload:'next'}});assert.match(next.message.text,/при рождении ребёнка/);c.store.close();});
test('reminder dates and opt-in validated',()=>{const c=context();let u=c.store.ensure('demo:x');assert.throws(()=>c.profiles.remind('demo:x',{benefitId:'b01',kind:'unfinished',dueAt:new Date(Date.now()+10000).toISOString()},u.version),/Включите/);assert.throws(()=>c.profiles.remind('demo:x',{benefitId:'b01',kind:'unfinished',dueAt:'yesterday'},u.version),/дату/);c.store.close();});

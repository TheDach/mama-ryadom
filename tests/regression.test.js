import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/storage/database.js';
import {Profiles} from '../src/services/profile.js';
import {Bot} from '../src/max/bot.js';
import {MaxClient} from '../src/max/client.js';
import {configuration} from '../src/config.js';
import {createApp} from '../src/http/server.js';
import {configureWebhook} from '../src/max/setup.js';
import {validateSettings} from '../src/domain/questions.js';
import {sendDueReminders} from '../src/max/worker.js';

function context() {
  const store=new Store(':memory:'),profiles=new Profiles(store);
  const config=configuration({DEMO_MODE:'true',BOT_USERNAME:'test_bot'});
  return {store,profiles,config,bot:new Bot(store,profiles,config)};
}
function callback(id,payload,uid=42) {
  return {update_type:'message_callback',timestamp:Date.now(),
    callback:{callback_id:id,payload,user:{user_id:uid,is_bot:false}},
    message:{sender:{user_id:999,is_bot:true},recipient:{user_id:uid,chat_id:77,chat_type:'dialog'},body:{mid:'bot-message',text:'МАМА рядом'}}};
}

test('MAX callback with original bot message starts and completes questionnaire',()=>{
  const c=context();try {
    c.bot.handle({update_type:'message_created',message:{sender:{user_id:42,is_bot:false},recipient:{chat_type:'dialog'},body:{mid:'start',text:'/start'}}});
    assert.match(c.bot.handle(callback('begin','begin')).message.text,/Согласны/);
    assert.match(c.bot.handle(callback('consent','consent')).message.text,/Вопрос 1/);
    for(const [i,value] of ['pregnant','30plus','1_yes','employed','yes_permanent','low','done'].entries()) {
      const u=c.store.ensure('max:42');
      const r=c.bot.handle(callback('answer-'+i,`a:${u.flow}:${u.questionIndex}:${value}`));
      assert.ok(r?.message.text);
    }
    assert.equal(c.profiles.view('max:42').profile.stage,'pregnant');
    assert.equal(c.profiles.view('max:42').questionnaire,false);
    assert.equal(c.bot.handle({update_type:'message_created',message:{sender:{user_id:999,is_bot:true},body:{mid:'own',text:'/start'}}}),null);
  }finally{c.store.close();}
});

test('MAX callback transport uses clicked callback ID and updates message',async()=>{
  const c=context(),requests=[];
  const client=new MaxClient({...c.config,token:'test-token'},async(url,options)=>{
    requests.push({url:new URL(url),body:JSON.parse(options.body)});
    return Response.json({success:true});
  });
  try {
    const r=c.bot.handle(callback('real-click','begin'));
    await c.bot.deliver(r,client);
    assert.equal(requests[0].url.pathname,'/answers');
    assert.equal(requests[0].url.searchParams.get('callback_id'),'real-click');
    assert.match(requests[0].body.message.text,/Согласны/);
    assert.equal(requests[0].body.message.attachments[0].payload.buttons[0][0].payload,'consent');
    assert.equal(c.bot.handle(callback('real-click','begin')),null);
  }finally{c.store.close();}
});

test('HTTP 200 callback rejection falls back to a new bot message',async()=>{
  const c=context(),paths=[];
  const client=new MaxClient({...c.config,token:'test-token'},async(url)=>{
    paths.push(new URL(url).pathname);
    return Response.json(paths.length===1?{success:false}:{message:{body:{mid:'fallback'}}});
  });
  try {
    await c.bot.deliver(c.bot.handle(callback('expired','begin')),client);
    assert.deepEqual(paths,['/answers','/messages']);
  }finally{c.store.close();}
});

test('reminder limit returns a response and the next bot action still works',async()=>{
  const c=context();try {
    let u=c.store.ensure('max:42');
    u.reminders=Array.from({length:30},(_,i)=>({id:String(i),kind:'unfinished',benefitId:'b01',dueAt:new Date(Date.now()+86400000).toISOString(),sentAt:null}));
    c.store.save('max:42',u);
    const r=c.bot.handle(callback('limit','remind:b01'));
    assert.match(r.message.text,/лимит 30/);
    await c.bot.deliver(r,{send:async()=>{}});
    assert.equal(c.bot.handle(callback('limit','remind:b01')),null);
    assert.equal(c.store.ensure('max:42').reminders.length,30);
    assert.equal(c.store.ensure('max:42').settings.unfinished,false);
    assert.match(c.bot.handle(callback('help','help')).message.text,/6-7/);
  }finally{c.store.close();}
});

test('prototype names cannot become tracking statuses or settings',()=>{
  const c=context();try {
    const v=c.store.ensure('demo:x').version;
    for(const status of ['toString','constructor','__proto__',null,{}])assert.throws(()=>c.profiles.track('demo:x','b01',status,v));
    assert.deepEqual(c.store.ensure('demo:x').tracking,{});
    assert.throws(()=>validateSettings({constructor:true}));
    assert.throws(()=>validateSettings(JSON.parse('{"__proto__":true}')));
  }finally{c.store.close();}
});

test('delete removes cached bot responses and duplicate confirmation does not recreate user',async()=>{
  const c=context();try {
    c.bot.handle(callback('first','begin'));
    const token=c.store.session('max:42',60);
    const r=c.bot.handle(callback('delete','delete_confirm'));
    assert.equal(c.store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
    assert.equal(c.store.authenticate(token),undefined);
    assert.equal(c.store.db.prepare('SELECT COUNT(*) AS n FROM updates WHERE user_id IS NOT NULL OR response LIKE ?').get('%"userId":42%').n,0);
    await c.bot.deliver(r,{send:async()=>{}});
    assert.equal(c.bot.handle(callback('delete','delete_confirm')),null);
    assert.equal(c.store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
  }finally{c.store.close();}
});

test('pending response is not delivered after user deletion',async()=>{
  const c=context();try {
    const r=c.bot.handle(callback('pending','begin'));c.store.delete('max:42');
    let sent=0;await c.bot.deliver(r,{send:async()=>{sent++;}});assert.equal(sent,0);
  }finally{c.store.close();}
});

test('deletion during reminder delivery does not recreate profile',async()=>{
  const c=context();try {
    let u=c.store.ensure('max:42');u.botConnected=true;u.botUserId=42;u.settings.unfinished=true;
    u.reminders=[{id:'r',benefitId:'b01',kind:'unfinished',dueAt:new Date(0).toISOString(),sentAt:null,attempts:0}];c.store.save('max:42',u);
    await sendDueReminders(c.store,{send:async()=>c.store.delete('max:42')});
    assert.equal(c.store.find('max:42'),undefined);
  }finally{c.store.close();}
});

test('existing SQLite update cache migrates and can be deleted with its owner',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mama-migration-')),path=join(dir,'old.sqlite');
  try {
    const old=new DatabaseSync(path);
    old.exec('CREATE TABLE updates(id TEXT PRIMARY KEY,response TEXT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL)');
    old.prepare('INSERT INTO updates VALUES (?,?,0,?)').run('old',JSON.stringify({userId:42,message:{text:'Ответ'}}),Date.now());old.close();
    const s=new Store(path);try {
      assert.equal(s.db.prepare('SELECT user_id FROM updates').get().user_id,'max:42');
      s.delete('max:42');assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM updates').get().n,0);
    }finally{s.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('webhook subscription explicitly includes button events',async()=>{
  const requests=[],config=configuration({DEMO_MODE:'true',BOT_TOKEN:'test-token',PUBLIC_URL:'https://example.com',WEBHOOK_SECRET:'x'.repeat(32)});
  await configureWebhook({request:async(...args)=>requests.push(args)},config);
  assert.equal(requests[0][1],'/subscriptions');
  assert.deepEqual(requests[0][3].update_types,['bot_started','message_created','message_callback']);
  assert.equal(requests[0][3].url,'https://example.com/api/max/webhook');
});

test('webhook handles real callback envelopes and returns HTTP 200',async()=>{
  const c=context(),sent=[];Object.assign(c.config,{demo:false,botMode:'webhook',token:'test-token',webhookSecret:'x'.repeat(32)});
  const server=createApp({...c,client:{send:async(...args)=>sent.push(args)}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/api/max/webhook';
  try {
    for(const update of [callback('web-begin','begin'),callback('web-consent','consent')]) {
      const res=await fetch(url,{method:'POST',headers:{'X-Max-Bot-Api-Secret':c.config.webhookSecret},body:JSON.stringify(update)});
      assert.equal(res.status,200);
    }
    assert.equal(sent.length,2);assert.equal(sent[0][0],42);assert.equal(sent[0][2],'web-begin');assert.match(sent[1][1].text,/Вопрос 1/);
    const v=c.profiles.view('max:42');assert.equal(v.questionnaire,true);
  }finally{await new Promise(r=>server.close(r));c.store.close();}
});

test('API rejects invalid statuses and unexpected fields without changing state',async()=>{
  const c=context(),server=createApp({...c,client:{send:async()=>{}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try {
    const {token}=await fetch(base+'/api/auth',{method:'POST',body:'{"demo":true}'}).then(r=>r.json());
    const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    for(const [path,method,body] of [
      ['/api/tracking/b01','PUT',{status:'toString',version:0}],
      ['/api/tracking/b01','PUT',{status:'planned',version:0,extra:true}],
      ['/api/profile','PUT',{version:0,settings:{constructor:true}}],
      ['/api/profile','PUT',{version:0,extra:true}],
      ['/api/reminders','POST',{version:0,deleteId:'x',extra:true}]
    ])assert.equal((await fetch(base+path,{method,headers,body:JSON.stringify(body)})).status,400);
    assert.equal((await fetch(base+'/api/state',{headers}).then(r=>r.json())).version,0);
  }finally{await new Promise(r=>server.close(r));c.store.close();}
});

test('malformed updates and prototype-named text do not crash bot',()=>{
  const c=context();try {
    for(const value of [null,[],false,callback('bad',{})])assert.equal(c.bot.handle(value),null);
    assert.ok(c.bot.handle({update_type:'message_created',message:{sender:{user_id:42},body:{mid:'text',text:'toString'}}}).message.text);
  }finally{c.store.close();}
});

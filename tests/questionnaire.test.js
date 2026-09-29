import test from 'node:test';
import assert from 'node:assert/strict';
import {questions, questionPath, applyAnswer, answerValue} from '../src/domain/questionnaire.js';
import {transitionQuestionnaire} from '../src/services/questionnaire.js';
import {Store} from '../src/storage/database.js';
import {Profiles} from '../src/services/profile.js';
import {Bot} from '../src/max/bot.js';
import {configuration} from '../src/config.js';
import {catalog, rules} from '../src/services/catalog.js';
import {evaluate} from '../src/domain/eligibility.js';

const sample = {stage:'pregnant',pregnancyWeeks:'30plus',children:'1',firstChild:'yes',employment:'employed',citizenship:'yes',registration:'permanent',income:'low',received:[]};
function answer(u,value,action='answer') { return transitionQuestionnaire(u,{action,value,flow:u.flow,questionId:questionPath(u.draft)[u.questionIndex].id}); }
function setup(){const store=new Store(':memory:');return {store,profiles:new Profiles(store)};}

test('all branches stay within 6-7 steps and reach all fifteen questions',()=>{
  const reached=new Set();
  for(const stage of ['pregnant','under18','18to36','3to7'])for(const children of ['1','2','3'])for(const employment of ['employed','self','unemployed','student']){
    const p={...sample,stage,children,employment,childAge:'under6'};
    const path=questionPath(p);assert.equal(path.length,['pregnant','under18'].includes(stage)?7:6);
    let u=transitionQuestionnaire({profile:{},draft:{},questionnaire:false},{action:'start',consent:true});
    while(u.questionnaire){const q=questionPath(u.draft)[u.questionIndex];reached.add(q.id);u=answer(u,answerValue(p,q));}
    assert.equal(u.profile.stage,stage);assert.equal(u.profile.employment,employment);
  }
  assert.equal(reached.size,questions.length);assert.equal(reached.size,15);
});
test('stage change clears timing from the old branch and keeps received history',()=>{
  const p=applyAnswer({...sample,received:['capital']},questions[0],'under18');
  assert.equal(p.pregnancyWeeks,undefined);assert.deepEqual(p.received,['capital']);
  assert.equal(questionPath(p)[1].id,'infant');
  const other=applyAnswer({...p,childAge:'under6'},questions[0],'3to7');assert.equal(other.childAge,undefined);assert.equal(questionPath(other).length,6);
});
test('back invalidates old buttons even on the same question and preserves valid answers',()=>{
  let u=transitionQuestionnaire({profile:{},draft:{}},{action:'start',consent:true});
  const firstFlow=u.flow;u=answer(u,'pregnant');u=answer(u,undefined,'back');assert.notEqual(u.flow,firstFlow);
  assert.throws(()=>transitionQuestionnaire(u,{action:'answer',flow:firstFlow,questionId:'stage',value:'under18'}),/изменился/);
  u=answer(u,'under18');assert.equal(questionPath(u.draft)[u.questionIndex].id,'infant');
});
test('invalid answers and forged completion cannot skip required questions',()=>{
  let u=transitionQuestionnaire({profile:{},draft:{}},{action:'start',consent:true});
  assert.throws(()=>answer(u,'garbage'),/Выберите/);
  assert.throws(()=>answer(u,['pregnant'],'select'),/один/);
  assert.throws(()=>transitionQuestionnaire(u,{action:'answer',flow:u.flow,questionId:'receivedParent',value:[]}),/изменился/);
  assert.equal(u.questionIndex,0);
});
test('bot and API continue one draft and share the completed profile',()=>{
  const {store,profiles}=setup();const bot=new Bot(store,profiles,configuration({DEMO_MODE:'true'}));let n=0;
  const send=payload=>bot.handle({callback:{user:{user_id:7},callback_id:'flow-'+ ++n,payload}});
  try {
    send('consent');let u=store.ensure('max:7');send(`a:${u.flow}:0:under18`);
    let v=profiles.view('max:7');assert.equal(questionPath(v.draft)[v.questionIndex].id,'infant');
    const values=['6to12','2_no','employed','yes_temporary','unknown',[]];
    for(const value of values){v=profiles.questionnaire('max:7',{action:'answer',value,flow:v.flow,questionId:questionPath(v.draft)[v.questionIndex].id},v.version);}
    assert.equal(v.questionnaire,false);assert.equal(v.profile.childAge,'6to12');assert.equal(v.profile.income,'unknown');assert.match(send('result').message.text,/Подбор готов/);
  }finally{store.close();}
});
test('conflict leaves draft unchanged and completed legacy profiles remain editable',()=>{
  const {store,profiles}=setup();try {
    const old=store.ensure('demo:x');let v=profiles.update('demo:x',{profile:sample,consent:true},old.version);
    v=profiles.questionnaire('demo:x',{action:'start'},v.version);const before=v.version;
    assert.throws(()=>profiles.questionnaire('demo:x',{action:'answer',flow:v.flow,questionId:'stage',value:'under18'},v.version-1),/изменился/);
    assert.equal(store.ensure('demo:x').version,before);
    const legacy=store.ensure('demo:legacy');legacy.questionnaire=true;legacy.questionIndex=7;legacy.draft=sample;legacy.consent=true;store.save('demo:legacy',legacy);
    const resumed=profiles.questionnaire('demo:legacy',{action:'start'},store.ensure('demo:legacy').version);assert.equal(resumed.questionIndex,0);assert.equal(resumed.draft.stage,'pregnant');
  }finally{store.close();}
});
test('all settings save together and invalid settings do not partially apply',()=>{
  const {store,profiles}=setup();try {
    let v=profiles.view('demo:s');const settings={theme:'dark',fontSize:'large',accessible:false,deadlines:true,unfinished:true,lifeEvents:true,service:false};
    v=profiles.update('demo:s',{settings},v.version);assert.deepEqual(v.settings,settings);
    assert.throws(()=>profiles.update('demo:s',{settings:{theme:'light',fontSize:'broken'}},v.version));assert.deepEqual(profiles.view('demo:s').settings,settings);
  }finally{store.close();}
});
test('MAX buttons use callback payloads and reject invalid answers without blocking polling',()=>{
  const {store,profiles}=setup();const bot=new Bot(store,profiles,configuration({DEMO_MODE:'true'}));try {
    const r=bot.handle({callback:{user:{user_id:9},callback_id:'s',payload:'consent'}});
    const button=r.message.attachments[0].payload.buttons[0][0];assert.equal(button.type,'callback');assert.match(button.payload,/^a:/);
    const u=store.ensure('max:9');const wrong=bot.handle({callback:{user:{user_id:9},callback_id:'w',payload:`a:${u.flow}:0:bad`}});assert.match(wrong.message.text,/не распознан/);assert.equal(store.ensure('max:9').questionIndex,0);
  }finally{store.close();}
});
test('timing answers affect clarification while test data remains explicit',()=>{
  const b=catalog.find(b=>b.id==='b01');assert.equal(evaluate(b,{...sample,pregnancyWeeks:'under12'},rules).match,'clarify');
  const infant=catalog.find(b=>b.id==='b16');assert.equal(evaluate(infant,{...sample,stage:'under18',childAge:'12to18'},rules).match,'ineligible');
  assert.equal(evaluate(infant,{...sample,stage:'under18',childAge:'unknown'},rules).match,'clarify');
});

test('configuration rejects redirect URLs and preserves host-assigned ports',()=>{
  assert.throws(()=>configuration({DEMO_MODE:'true',PUBLIC_URL:'https://vk.ru/away.php?to=https://example.com'}),/прямой адрес/);
  assert.equal(configuration({DEMO_MODE:'true',PUBLIC_URL:'https://example.com',PORT:'8080'}).port,8080);
  assert.throws(()=>configuration({DEMO_MODE:'true',PORT:'70000'}),/65535/);
});

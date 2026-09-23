import {createHash, randomBytes} from 'node:crypto';
import {questions, validateProfile} from '../domain/questions.js';
import {disclosure, catalog} from '../services/catalog.js';
const button=(text,payload)=>({type:'callback',text,payload});
const message=(text,buttons=[])=>({text,attachments:buttons.length?[{type:'inline_keyboard',payload:{buttons}}]:[]});
export class Bot {
  constructor(store,profiles,config){this.store=store;this.profiles=profiles;this.config=config;}
  app(text,route='benefits') {
    if(!this.config.botUsername) return [];
    return [[{type:'open_app',text,web_app:`https://max.ru/${this.config.botUsername}?startapp=${encodeURIComponent(route)}`,payload:route}]];
  }
  menu(u) {
    return message(`МАМА рядом\nПомогу за несколько минут найти потенциальные меры поддержки и следующий шаг.\n\n${disclosure}\nИспользуйте вымышленные ответы. ФИО, документы и точный доход не нужны. /delete — удалить профиль.`,[
      [button(u.questionnaire?'Продолжить опрос':'Подобрать поддержку','begin')],
      [button('Мои выплаты','result'),button('Как это работает','help')],...this.app('Открыть приложение','home')]);
  }
  question(u) {
    const q=questions[u.questionIndex];
    const rows=q.options.map(([v,label])=>[button(`${q.multiple && u.draft.received?.includes(v)?'✓ ':''}${label}`,`a:${u.flow}:${u.questionIndex}:${v}`)]);
    if(q.multiple) rows.push([button('Готово',`a:${u.flow}:${u.questionIndex}:done`)]);
    if(u.questionIndex>0) rows.push([button('Назад',`back:${u.flow}:${u.questionIndex}`)]);
    return message(`Вопрос ${u.questionIndex+1} из ${questions.length}\n${q.title}\n${q.hint || ''}\n\nТестовые данные. Прогресс сохраняется.`,rows);
  }
  summary(id,onlyClarify=false) {
    const v=this.profiles.view(id);
    if(!v.profile.stage) return message('Сначала пройдите короткий опрос.',[[button('Начать','begin')]]);
    const eligible=v.benefits.filter(b=>b.auto && b.match==='eligible'), clarify=v.benefits.filter(b=>b.auto && b.match==='clarify'), received=v.benefits.filter(b=>!b.duplicateOf && b.match==='received');
    const list=onlyClarify?clarify:[...eligible,...clarify];
    return message(`Подбор готов\nМожно рассмотреть: ${eligible.length}\nТребует уточнения: ${clarify.length}\nОформлено: ${received.length}\n\n${list.length?list.slice(0,5).map(b=>`• ${b.title}`).join('\n'):'По введённым данным мы не нашли подходящих мер в демонстрационном наборе.'}\n\n${disclosure}`,[[button('Ближайший шаг','next'),button('Что уточнить','clarify')],[button('Изменить ответы','edit')],...this.app('Посмотреть подборку','benefits')]);
  }
  handle(update) {
    const uid=update.callback?.user?.user_id ?? update.message?.sender?.user_id ?? update.user?.user_id;
    if(!Number.isSafeInteger(uid) || uid<=0 || update.message?.sender?.is_bot || update.message?.recipient?.chat_type && update.message.recipient.chat_type!=='dialog') return null;
    const identity=update.callback?.callback_id || update.message?.body?.mid || `${update.update_type}:${uid}:${update.timestamp}`;
    const key=createHash('sha256').update(identity).digest('hex');
    const old=this.store.db.prepare('SELECT * FROM updates WHERE id=?').get(key);
    if(old) return old.delivered?null:{...JSON.parse(old.response),key};
    return this.store.transaction(()=>{
      const id=`max:${uid}`, u=this.store.ensure(id);
      u.botConnected=true;u.botUserId=uid;
      let action=update.callback?.payload || update.message?.body?.text || '/start';
      const command={'/start':'start','/help':'help','/result':'result','/next':'next','/edit':'edit','/delete':'delete','/stop':'stop','/life':'life'};
      action=command[action] || action;
      let response;
      if(action==='begin' || action==='edit') {
        if(!u.consent) response=message('Демонстрация: отвечайте вымышленными данными. Сохраняются категории ответов и технический ID MAX для связи с приложением. Согласны?',[[button('Согласна, продолжить','consent')],[button('Назад','start')]]);
        else {if(action==='edit' || !u.questionnaire){u.draft={...u.profile};u.questionIndex=0;u.flow=randomBytes(4).toString('hex');}u.questionnaire=true;response=this.question(u);}
      } else if(action==='consent') {u.consent=true;u.questionnaire=true;u.questionIndex=0;u.flow=randomBytes(4).toString('hex');u.draft={...u.profile};this.store.event('questionnaire_started');response=this.question(u);}
      else if(action.startsWith('a:') || action.startsWith('back:')) {
        const [type,flow,index,value]=action.split(':');
        if(!u.questionnaire || flow!==u.flow || Number(index)!==u.questionIndex) response=message('Эта кнопка устарела. Продолжите текущий опрос.',[[button('Продолжить','begin')]]);
        else if(type==='back'){u.questionIndex=Math.max(0,u.questionIndex-1);response=this.question(u);}
        else {
          const q=questions[u.questionIndex];
          if(q.multiple && value==='done'){u.draft.received ||= [];u.questionIndex++;}
          else if(q.options.some(o=>o[0]===value)){
            if(q.multiple){const set=new Set(u.draft.received || []);set.has(value)?set.delete(value):set.add(value);u.draft.received=[...set];}
            else {u.draft[q.id]=value;u.questionIndex++;}
          }
          if(u.questionIndex===questions.length){u.profile=validateProfile(u.draft);u.questionnaire=false;this.store.event('questionnaire_completed');}
          else response=this.question(u);
        }
      } else if(action==='delete') response=message('Удалить ответы, настройки, статусы и напоминания? Это действие нельзя отменить.',[[button('Удалить мои данные','delete_confirm')],[button('Отмена','start')]]);
      else if(action==='delete_confirm') {
        this.store.delete(id);
        response=message('Ваши данные удалены. /start — начать заново.');
      } else if(action==='stop'){u.settings.deadlines=false;u.settings.unfinished=false;u.settings.lifeEvents=false;u.settings.service=false;response=message('Все напоминания отключены. Включить их можно в настройках приложения.');}
      else if(action==='life') response=message('Ребёнок уже родился или изменилась ситуация? Обновите ответы — подборка пересчитается.',[[button('Обновить профиль','edit')],...this.app('Открыть профиль','profile')]);
      else if(action==='help') response=message('8 вопросов → потенциальные меры → документы и следующий шаг → личный трекер. Статусы вы задаёте сами; заявления в ведомства не отправляются. Каталог — тестовый. /stop отключает напоминания, /delete удаляет профиль.',[[button('Подобрать поддержку','begin')]]);
      else if(!['result','clarify','next'].includes(action)) response=this.menu(u);
      if(action!=='delete_confirm') this.store.save(id,u);
      if(!response) {
        if(action==='next') {
          const b=this.profiles.view(id).next;
          response=b?message(`${b.title}\n${b.nextStep}\n${b.missing.join('\n')}\n\nДокументы:\n${b.documents.join('\n')}\nКуда: ${b.organization}\nСрок: ${b.deadline}\n\n${disclosure}`,[...this.app('Открыть документы',`benefit_${b.id}`),[button('Напомнить завтра','remind:'+b.id)],[button('Мои выплаты','result')]]):message('Нет следующего действия в тестовом наборе. Проверьте ответы.',[[button('Изменить ответы','edit')]]);
        } else response=this.summary(id,action==='clarify');
      }
      if(action.startsWith('remind:')) {
        const benefitId=action.slice(7);
        if(catalog.some(b=>b.id===benefitId)){
          const current=this.store.ensure(id);current.settings.unfinished=true;this.store.save(id,current);
          this.profiles.remind(id,{benefitId,dueAt:new Date(Date.now()+86400000).toISOString(),kind:'unfinished'},this.store.ensure(id).version);
          response=message('Напомню через 24 часа. /stop — отключить уведомления.',[[button('Мои выплаты','result')]]);
        }
      }
      const result={userId:uid,callbackId:update.callback?.callback_id,message:response};
      this.store.db.prepare('INSERT INTO updates(id,response,created) VALUES (?,?,?)').run(key,JSON.stringify(result),Date.now());
      return {...result,key};
    });
  }
  async deliver(result,client) {
    if(!result) return;
    try {await client.send(result.userId,result.message,result.callbackId);}
    catch(e){if(result.callbackId && [400,404,410].includes(e.status)) await client.send(result.userId,result.message);else throw e;}
    this.store.db.prepare('UPDATE updates SET delivered=1 WHERE id=?').run(result.key);
  }
}

import {createHash} from 'node:crypto';
import {questionPath, answerValue} from '../domain/questionnaire.js';
import {transitionQuestionnaire} from '../services/questionnaire.js';
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
    return message(`МАМА рядом\nПодбор мер поддержки семьи в Томской области.\n\n${disclosure}\nИспользуйте вымышленные ответы. ФИО, документы и точный доход не нужны. /delete - удалить профиль.`,[
      [button(u.questionnaire?'Продолжить опрос':'Подобрать поддержку','begin')],
      [button('Мои выплаты','result'),button('Как это работает','help')],...this.app('Открыть приложение','home')]);
  }
  question(u) {
    const path=questionPath(u.draft), q=path[u.questionIndex];
    const rows=q.options.map(([v,label])=>[button(`${q.multiple && u.draft.received?.includes(v)?'✓ ':''}${label}`,`a:${u.flow}:${u.questionIndex}:${v}`)]);
    if(q.multiple) rows.push([button('Готово',`a:${u.flow}:${u.questionIndex}:done`)]);
    if(u.questionIndex>0) rows.push([button('Назад',`back:${u.flow}:${u.questionIndex}`)]);
    return message(`Вопрос ${u.questionIndex+1} из ${u.draft.stage?path.length:'6 или 7'}\n${q.title}\n${q.hint || ''}\n\nТестовые данные. Прогресс сохраняется.`,rows);
  }
  summary(id,onlyClarify=false) {
    const v=this.profiles.view(id);
    if(!v.profile.stage) return message('Сначала пройдите короткий опрос.',[[button('Начать','begin')]]);
    const eligible=v.benefits.filter(b=>b.auto && b.match==='eligible'), clarify=v.benefits.filter(b=>b.auto && b.match==='clarify'), received=v.benefits.filter(b=>!b.duplicateOf && b.match==='received');
    const list=onlyClarify?clarify:[...eligible,...clarify];
    return message(`Подбор готов\nМожно рассмотреть: ${eligible.length}\nТребует уточнения: ${clarify.length}\nОформлено: ${received.length}\n\n${list.length?list.slice(0,5).map(b=>`• ${b.title}`).join('\n'):'По введённым данным мы не нашли подходящих мер в демонстрационном наборе.'}\n\n${disclosure}`,[[button('Ближайший шаг','next'),button('Что уточнить','clarify')],[button('Изменить ответы','edit')],...this.app('Посмотреть подборку','benefits')]);
  }
  textAction(value,u) {
    const commands={
      'Подобрать поддержку':'begin','Продолжить опрос':'begin','Изменить ответы':'edit',
      'Обновить профиль':'edit','Согласна, продолжить':'consent','Назад':'start',
      'Мои выплаты':'result','Как это работает':'help','Ближайший шаг':'next',
      'Что уточнить':'clarify','Начать':'begin','Отмена':'start',
      'Удалить мои данные':'delete_confirm','Продолжить':'begin'
    };
    if(value==='Напомнить завтра'){
      const next=this.profiles.view(u.id).next;
      return next?`remind:${next.id}`:'result';
    }
    if(value==='Готово' && u.questionnaire && questionPath(u.draft)[u.questionIndex]?.multiple)
      return `a:${u.flow}:${u.questionIndex}:done`;
    if(u.questionnaire){
      const path=questionPath(u.draft), q=path[u.questionIndex];
      const option=q?.options.find(([,label])=>label===value.replace(/^✓ /,''));
      if(option)return `a:${u.flow}:${u.questionIndex}:${option[0]}`;
      if(value==='Назад' && u.questionIndex>0)return `back:${u.flow}:${u.questionIndex}`;
    }
    return Object.hasOwn(commands,value)?commands[value]:value;
  }
  handle(update) {
    if(!update || typeof update!=='object' || Array.isArray(update))return null;
    if(update.callback && (typeof update.callback.payload!=='string' || !update.callback.payload || typeof update.callback.callback_id!=='string'))return null;
    const uid=update.callback?.user?.user_id ?? update.message?.sender?.user_id ?? update.user?.user_id;
    if(!Number.isSafeInteger(uid) || uid<=0 || (!update.callback && update.message?.sender?.is_bot) || update.message?.recipient?.chat_type && update.message.recipient.chat_type!=='dialog') return null;
    const identity=update.callback?.callback_id || update.message?.body?.mid || `${update.update_type}:${uid}:${update.timestamp}`;
    const key=createHash('sha256').update(identity).digest('hex');
    const old=this.store.db.prepare('SELECT * FROM updates WHERE id=?').get(key);
    if(old) return old.delivered?null:{...JSON.parse(old.response),key};
    return this.store.transaction(()=>{
      const id=`max:${uid}`;let u=this.store.ensure(id);
      u.botConnected=true;u.botUserId=uid;
      let action=update.callback?.payload || this.textAction(update.message?.body?.text || '/start',{...u,id});
      const command={'/start':'start','/help':'help','/result':'result','/next':'next','/edit':'edit','/delete':'delete','/stop':'stop','/life':'life'};
      action=Object.hasOwn(command,action)?command[action]:action;
      let response;
      if(action==='begin' || action==='edit') {
        if(!u.consent) response=message('Демонстрация: отвечайте вымышленными данными. Сохраняются категории ответов и технический ID MAX для связи с приложением. Согласны?',[[button('Согласна, продолжить','consent')],[button('Назад','start')]]);
        else {
          const started=!u.questionnaire || action==='edit';
          u=transitionQuestionnaire(u,{action:'start',restart:action==='edit'});
          if(started)this.store.event('questionnaire_started');
          response=this.question(u);
        }
      } else if(action==='consent') {
        u=transitionQuestionnaire(u,{action:'start',consent:true});
        this.store.event('questionnaire_started');response=this.question(u);
      } else if(action.startsWith('a:') || action.startsWith('back:')) {
        const [type,flow,index,value]=action.split(':');
        if(!u.questionnaire || u.questionnaireVersion!==2 || flow!==u.flow || Number(index)!==u.questionIndex) response=message('Эта кнопка устарела. Продолжите текущий опрос.',[[button('Продолжить','begin')]]);
        else {
          const q=questionPath(u.draft)[u.questionIndex];
          let input={action:type==='back'?'back':'answer',flow,questionId:q.id,value};
          if(q.multiple && type!=='back') {
            const selected=new Set(answerValue(u.draft,q) || []);
            if(value!=='done') {selected.has(value)?selected.delete(value):selected.add(value);input.action='select';}
            input.value=[...selected];
          }
          try{u=transitionQuestionnaire(u,input);}catch(e){if(e.status===409)throw e;response=message('Ответ не распознан. Выберите вариант в текущем вопросе.',[[button('Продолжить','begin')]]);}
          if(u.questionnaire && !response)response=this.question(u);
          else if(!u.questionnaire) this.store.event('questionnaire_completed');
        }
      } else if(action==='delete') response=message('Удалить ответы, настройки, статусы и напоминания? Это действие нельзя отменить.',[[button('Удалить мои данные','delete_confirm')],[button('Отмена','start')]]);
      else if(action==='delete_confirm') {
        this.store.delete(id);
        response=message('Ваши данные удалены. /start - начать заново.');
      } else if(action==='stop'){u.settings.deadlines=false;u.settings.unfinished=false;u.settings.lifeEvents=false;u.settings.service=false;response=message('Все напоминания отключены. Включить их можно в настройках приложения.');}
      else if(action==='life') response=message('Ребёнок уже родился или изменилась ситуация? Обновите ответы - подборка пересчитается.',[[button('Обновить профиль','edit')],...this.app('Открыть профиль','profile')]);
      else if(action==='help') response=message('6-7 шагов опроса. Затем подборка, документы и личный список выплат. Статусы вы задаёте сами; заявления в ведомства не отправляются. Каталог - тестовый. /stop отключает напоминания, /delete удаляет профиль.',[[button('Подобрать поддержку','begin')]]);
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
          const current=this.store.ensure(id);
          if(current.reminders.filter(r=>!r.sentAt).length>=30) {
            response=message('Достигнут лимит 30 напоминаний. Удалите ненужное напоминание в приложении и повторите.',[...this.app('Управлять напоминаниями','applications'),[button('Мои выплаты','result')]]);
          } else {
            current.settings.unfinished=true;this.store.save(id,current);
            this.profiles.remind(id,{benefitId,dueAt:new Date(Date.now()+86400000).toISOString(),kind:'unfinished'},this.store.ensure(id).version);
            response=message('Напомню через 24 часа. /stop - отключить уведомления.',[[button('Мои выплаты','result')]]);
          }
        }
      }
      const result={userId:uid,callbackId:update.callback?.callback_id,message:response};
      const deleted=action==='delete_confirm';
      this.store.db.prepare('INSERT INTO updates(id,response,created,user_id,delivered) VALUES (?,?,?,?,?)').run(key,deleted?'null':JSON.stringify(result),Date.now(),deleted?null:id,deleted?1:0);
      return {...result,key};
    });
  }
  async deliver(result,client) {
    if(!result) return;
    if(!this.store.db.prepare('SELECT id FROM updates WHERE id=?').get(result.key))return;
    try {await client.send(result.userId,result.message,result.callbackId);}
    catch(e){if(result.callbackId && [400,404,410].includes(e.status)) await client.send(result.userId,result.message);else throw e;}
    this.store.db.prepare('UPDATE updates SET delivered=1 WHERE id=?').run(result.key);
  }
}

import {setTimeout as delay} from 'node:timers/promises';
import {catalog} from '../services/catalog.js';
export async function poll(bot,client,store,signal) {
  let failures=0;
  while(!signal.aborted) {
    try {
      const data=await client.request('GET','/updates',{timeout:25,limit:50,marker:store.meta('max_marker'),types:'bot_started,message_created,message_callback'});
      for(const update of data.updates || []) await bot.deliver(bot.handle(update),client);
      if(data.marker!=null) store.setMeta('max_marker',data.marker);
      failures=0;
    } catch(e){console.error('MAX: не удалось обработать события',e);failures++;await delay(Math.min(30000,1000*2**Math.min(failures,5)),null,{signal}).catch(()=>{});}
  }
}
export async function sendDueReminders(store,client,now=Date.now()) {
  let sent=0;
  for(const user of store.users()) {
    if(!user.botConnected || !user.botUserId) continue;
    for(const reminder of user.reminders) {
      if(reminder.sentAt || !user.settings[reminder.kind] || Date.parse(reminder.dueAt)>now || (reminder.retryAt || 0)>now) continue;
      const b=catalog.find(b=>b.id===reminder.benefitId);
      const text=reminder.kind==='lifeEvents'?'Изменилась жизненная ситуация? /life — обновить профиль.':`Вы планировали проверить: ${b?.title || 'меру поддержки'}. /next — следующий шаг.`;
      let success=false;
      try {await client.send(user.botUserId,{text:`МАМА рядом\n${text}\nТестовые данные. /stop — отключить напоминания.`});success=true;sent++;}
      catch {console.error('MAX: доставка напоминания отложена');}
      const current=store.ensure(user.id), r=current.reminders.find(x=>x.id===reminder.id);
      if(!r)continue;
      r.attempts++;if(success)r.sentAt=new Date(now).toISOString();else r.retryAt=now+Math.min(86400000,60000*2**Math.min(r.attempts,10));
      store.save(user.id,current);
    }
  }
  return sent;
}

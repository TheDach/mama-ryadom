import {configuration} from '../src/config.js';
import {MaxClient} from '../src/max/client.js';
const config=configuration(),client=new MaxClient(config);
if(!config.token)throw new Error('Заполните BOT_TOKEN в .env');
const info=await client.request('GET','/me');
console.log('Бот доступен:',info.username || info.user_id);
await client.request('PATCH','/me',{}, {commands:[{name:'start',description:'Подобрать поддержку'},{name:'result',description:'Мои выплаты'},{name:'next',description:'Следующий шаг'},{name:'edit',description:'Изменить ответы'},{name:'life',description:'Изменить жизненный этап'},{name:'stop',description:'Отключить напоминания'},{name:'delete',description:'Удалить профиль'},{name:'help',description:'Как это работает'}]});
if(config.botMode==='webhook'){
  if(!config.publicUrl.startsWith('https://'))throw new Error('Для webhook требуется HTTPS');
  await client.request('POST','/subscriptions',{}, {url:new URL('/api/max/webhook',config.publicUrl).href,update_types:['bot_started','message_created','message_callback'],secret:config.webhookSecret});
  console.log('Webhook зарегистрирован');
}else{
  const result=await client.request('GET','/subscriptions');
  if(result.subscriptions?.length)console.log('Есть webhook-подписки. Для polling удалите их в MAX или используйте BOT_MODE=webhook.');
}
console.log('Укажите PUBLIC_URL как адрес мини-приложения в настройках бота на платформе MAX.');

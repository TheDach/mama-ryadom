import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {validateInitData} from '../max/auth.js';
import {questions, statusLabels} from '../domain/questions.js';
const publicDir=fileURLToPath(new URL('../../public/',import.meta.url));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function body(req) {
  const parts=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>32768){const e=new Error('Слишком большой запрос');e.status=413;throw e;}parts.push(chunk);}
  try{return JSON.parse(Buffer.concat(parts).toString() || '{}');}catch{throw new Error('Некорректный JSON');}
}
const equal=(a,b)=>{const x=Buffer.from(a || ''),y=Buffer.from(b || '');return x.length===y.length && timingSafeEqual(x,y);};
function fields(value,allowed) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)))throw new Error('Некорректные поля запроса');
  return value;
}
export function createApp({config,store,profiles,bot,client}) {
  const rates=new Map();
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://st.max.ru; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://max.ru https://*.max.ru");
    let path='';
    try {
      const url=new URL(req.url,'http://localhost');path=url.pathname;
      if(req.method==='GET' && path==='/api/health')return json(res,200,{status:'ok',version:'1.1.0'});
      if(path==='/api/max/webhook'){
        if(req.method!=='POST' || config.botMode!=='webhook' || !config.token)return json(res,404,{error:'Не найдено'});
        if(!equal(req.headers['x-max-bot-api-secret'],config.webhookSecret))return json(res,401,{error:'Нет доступа'});
        await bot.deliver(bot.handle(await body(req)),client);return json(res,200,{ok:true});
      }
      if(path.startsWith('/api/')){
        const now=Date.now(), key=req.socket.remoteAddress;
        if(rates.size>10000)for(const [k,r]of rates)if(r.until<now)rates.delete(k);
        const rate=rates.get(key);if(!rate || rate.until<now)rates.set(key,{count:1,until:now+60000});else if(++rate.count>240){res.setHeader('Retry-After','60');return json(res,429,{error:'Слишком много запросов. Повторите через минуту.'});}
        const origin=req.headers.origin;
        if(origin && origin!==new URL(config.publicUrl).origin)return json(res,403,{error:'Недопустимый источник запроса'});
        if(req.method==='GET' && path==='/api/config')return json(res,200,{demo:config.demo,questions,statusLabels});
        if(req.method==='POST' && path==='/api/auth'){
          const b=fields(await body(req),['initData','demo']);let id;
          if('demo' in b && typeof b.demo!=='boolean' || 'initData' in b && typeof b.initData!=='string')throw new Error('Некорректные параметры авторизации');
          if(b.initData){try{id='max:'+validateInitData(b.initData,config.token,config.initTtl);}catch(e){return json(res,401,{error:e.message});}}
          else if(config.demo && b.demo===true)id='demo:'+randomUUID();
          else return json(res,401,{error:'Откройте мини-приложение через бота MAX'});
          store.ensure(id);return json(res,200,{token:store.session(id,config.sessionTtl),expiresIn:config.sessionTtl});
        }
        const id=store.authenticate((req.headers.authorization || '').replace(/^Bearer /,''));
        if(!id)return json(res,401,{error:'Сессия истекла. Откройте приложение заново.'});
        if(req.method==='GET' && path==='/api/state')return json(res,200,profiles.view(id));
        if(req.method==='DELETE' && path==='/api/state'){store.delete(id);return json(res,200,{deleted:true});}
        if(req.method==='PUT' && path==='/api/questionnaire'){
          const b=await body(req);return json(res,200,profiles.questionnaire(id,b,b.version));
        }
        if(req.method==='PUT' && path==='/api/profile'){
          const b=await body(req);return json(res,200,profiles.update(id,b,b.version));
        }
        if(req.method==='PUT' && path.startsWith('/api/tracking/')){
          const b=fields(await body(req),['status','version']);if(!Number.isInteger(b.version))throw new Error('Укажите версию состояния');
          return json(res,200,profiles.track(id,path.split('/').at(-1),b.status,b.version));
        }
        if(req.method==='POST' && path==='/api/reminders'){
          const b=await body(req);if(!Number.isInteger(b.version))throw new Error('Укажите версию состояния');
          return json(res,200,profiles.remind(id,b,b.version));
        }
        return json(res,404,{error:'Метод не найден'});
      }
      if(req.method!=='GET' && req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'});
      const files={'/questionnaire.js':['../src/domain/questionnaire.js','text/javascript'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/logo.png':['logo.png','image/png'],'/favicon.svg':['logo.png','image/png']};
      const isRoute=path==='/' || /^\/(home|benefits|applications|profile|settings)(\/[-a-z0-9]+)?$/.test(path);
      const file=files[path] || (isRoute?['index.html','text/html']:null);
      if(!file)return json(res,404,{error:'Страница не найдена'});
      const data=await readFile(publicDir+file[0]);res.writeHead(200,{'Content-Type':file[1].startsWith('image/')?file[1]:file[1]+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);
    }catch(e){const status=e.status || (path==='/api/max/webhook'?503:400);if(status>=500)console.error('Запрос не выполнен',status);json(res,status,{error:status>=500?'Сервис временно недоступен. Повторите позже.':e.message});}
  });
}

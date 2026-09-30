import {configuration} from './config.js';
import {Store} from './storage/database.js';
import {Profiles} from './services/profile.js';
import {Bot} from './max/bot.js';
import {MaxClient} from './max/client.js';
import {poll, sendDueReminders, setupWebhook} from './max/worker.js';
import {createApp} from './http/server.js';
const config=configuration(), store=new Store(config.dbPath), profiles=new Profiles(store);
const client=new MaxClient(config), bot=new Bot(store,profiles,config), abort=new AbortController();
const server=createApp({config,store,profiles,bot,client});
server.listen(config.port,config.host,()=>console.log(`МАМА рядом: порт ${config.port}, ${config.demo?'локальный демо-режим':'MAX'}`));
let poller=Promise.resolve(),busy=false,reminderJob=Promise.resolve();
if(config.token && config.botMode==='polling')poller=poll(bot,client,store,abort.signal);
if(config.token && config.botMode==='webhook')poller=setupWebhook(client,config,abort.signal);
const timer=setInterval(()=>{
  if(!config.token || busy)return;
  busy=true;reminderJob=sendDueReminders(store,client).catch(()=>console.error('Ошибка очереди напоминаний')).finally(()=>{busy=false;});
},15000);
const cleanup=setInterval(()=>{
  store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  store.db.prepare('DELETE FROM updates WHERE created<?').run(Date.now()-7*86400000);
  store.db.prepare('DELETE FROM events WHERE created<?').run(Date.now()-90*86400000);
},3600000);
let closing=false;
async function shutdown(){if(closing)return;closing=true;abort.abort();clearInterval(timer);clearInterval(cleanup);server.close();await Promise.allSettled([poller,reminderJob,client.queue]);store.close();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

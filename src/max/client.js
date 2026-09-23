import {setTimeout as delay} from 'node:timers/promises';
export class MaxClient {
  constructor(config, fetcher=fetch){this.config=config;this.fetcher=fetcher;this.last=0;this.queue=Promise.resolve();}
  async request(method,path,query={},body) {
    const url=new URL(path,this.config.apiUrl);
    for(const [k,v] of Object.entries(query)) if(v!==undefined && v!==null) url.searchParams.set(k,v);
    const response=await this.fetcher(url,{method,headers:{Authorization:this.config.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(path==='/updates'?40000:15000)});
    if (!response.ok) {const e=new Error(`MAX HTTP ${response.status}`);e.status=response.status;throw e;}
    const data=await response.json();
    if(data.success===false) throw new Error('MAX отклонил запрос');
    return data;
  }
  send(userId,message,callbackId) {
    const job=this.queue.catch(()=>{}).then(async()=>{
      await delay(Math.max(0,550-(Date.now()-this.last)));this.last=Date.now();
      return callbackId?this.request('POST','/answers',{callback_id:callbackId},{message}):this.request('POST','/messages',{user_id:userId},message);
    });
    this.queue=job;return job;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateInitData} from '../src/max/auth.js';
export function sign(token='test-token',date=Math.floor(Date.now()/1000),id=42){const p=new URLSearchParams({auth_date:String(date),query_id:'test',user:JSON.stringify({id,first_name:'Тест'})});p.sort();const key=createHmac('sha256','WebAppData').update(token).digest();const hash=createHmac('sha256',key).update([...p].map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex');p.set('hash',hash);return p.toString();}
test('MAX valid signature identifies user',()=>assert.equal(validateInitData(sign(),'test-token'),'42'));
test('MAX tampered data and incorrect token rejected',()=>{assert.throws(()=>validateInitData(sign().replace('test&','evil&'),'test-token'));assert.throws(()=>validateInitData(sign(),'other-token'));});
test('MAX duplicate keys, stale and future launch rejected',()=>{assert.throws(()=>validateInitData(sign()+'&auth_date=0','test-token'));assert.throws(()=>validateInitData(sign('test-token',1),'test-token'));assert.throws(()=>validateInitData(sign('test-token',Math.floor(Date.now()/1000)+600),'test-token'));});
test('MAX invalid hash and missing user rejected',()=>{assert.throws(()=>validateInitData('hash=oops','test-token'));assert.throws(()=>validateInitData(sign('test-token',Math.floor(Date.now()/1000),-1),'test-token'));});

import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {defaultSettings} from '../domain/questions.js';
const hash = value => createHash('sha256').update(value).digest('hex');
export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS updates (id TEXT PRIMARY KEY, response TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (name TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);`);
    if(!this.db.prepare('PRAGMA table_info(updates)').all().some(c=>c.name==='user_id'))this.db.exec('ALTER TABLE updates ADD COLUMN user_id TEXT');
    this.db.exec("UPDATE updates SET user_id='max:' || json_extract(response,'$.userId') WHERE user_id IS NULL AND json_valid(response) AND json_extract(response,'$.userId') IS NOT NULL; CREATE INDEX IF NOT EXISTS updates_user ON updates(user_id);");
  }
  ensure(id) {
    let row = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!row) {
      const data = {profile:{}, draft:{}, questionIndex:0, questionnaire:false, consent:false, tracking:{}, settings:{...defaultSettings}, reminders:[], botConnected:false, botUserId:null};
      this.db.prepare('INSERT INTO users(id,data) VALUES (?,?)').run(id,JSON.stringify(data));
      row = {id, data:JSON.stringify(data), version:0};
    }
    return {...JSON.parse(row.data), version:row.version};
  }
  find(id) {
    const row=this.db.prepare('SELECT data,version FROM users WHERE id=?').get(id);
    return row?{...JSON.parse(row.data),version:row.version}:undefined;
  }
  save(id, data, expected) {
    const {version,...body} = data;
    const res = this.db.prepare('UPDATE users SET data=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(body),id,expected ?? version);
    if (!res.changes) {const e = new Error('Данные изменились. Обновите страницу и повторите.'); e.status=409; throw e;}
    return this.ensure(id);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {const r=fn();this.db.exec('COMMIT');return r;} catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  session(id, ttl) {
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomUUID()+randomUUID();
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),id,Date.now()+ttl*1000);
    return token;
  }
  authenticate(token) {return this.db.prepare('SELECT user_id FROM sessions WHERE token=? AND expires>?').get(hash(token || ''),Date.now())?.user_id;}
  delete(id) {
    const remove=()=>{
      this.db.prepare('DELETE FROM updates WHERE user_id=?').run(id);
      this.db.prepare('DELETE FROM users WHERE id=?').run(id);
    };
    if(this.db.isTransaction)remove();else this.transaction(remove);
  }
  users() {return this.db.prepare('SELECT id,data,version FROM users').all().map(r=>({id:r.id,...JSON.parse(r.data),version:r.version}));}
  meta(k) {return this.db.prepare('SELECT value FROM metadata WHERE key=?').get(k)?.value;}
  setMeta(k,v) {this.db.prepare('INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v));}
  event(name) {this.db.prepare('INSERT INTO events VALUES (?,?)').run(name,Date.now());}
  close() {this.db.close();}
}

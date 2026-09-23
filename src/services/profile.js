import {validateProfile, validateSettings, statusLabels} from '../domain/questions.js';
import {catalog, rules, disclosure, region} from './catalog.js';
import {selectBenefits, nextAction} from '../domain/eligibility.js';
import {randomUUID} from 'node:crypto';
export class Profiles {
  constructor(store){this.store=store;}
  view(id) {
    const u = this.store.ensure(id), matches = selectBenefits(catalog,u.profile,rules,u.tracking);
    return {...u, botUserId:undefined, isManyChildren:u.profile.children === '3', benefits:matches.map(b=>({...b,stageOptions:rules[b.id].conditions.find(c=>c.field==='stage')?.values || []})), next:nextAction(matches), disclosure, region};
  }
  update(id, patch, version) {
    const u=this.store.ensure(id);
    if (!Number.isInteger(version)) throw new Error('Укажите версию состояния');
    if (patch.profile) {
      if (!u.consent && patch.consent !== true) throw new Error('Подтвердите использование тестовых данных');
      u.profile=validateProfile(patch.profile);u.draft={...u.profile};u.questionnaire=false;
      this.store.event('questionnaire_completed');
    }
    if (patch.settings) u.settings={...u.settings,...validateSettings(patch.settings)};
    if (patch.consent === true) u.consent=true;
    this.store.save(id,u,version);return this.view(id);
  }
  track(id, benefitId, status, version) {
    if (!catalog.some(b=>b.id===benefitId) || !(status in statusLabels) && status !== 'remove') throw new Error('Некорректная мера или статус');
    const u=this.store.ensure(id);
    const b=catalog.find(b=>b.id===benefitId);
    benefitId=b.duplicateOf || benefitId;
    if (status === 'remove') delete u.tracking[benefitId];
    else u.tracking[benefitId]={status,updatedAt:new Date().toISOString()};
    if (status !== 'received') u.profile.received = (u.profile.received || []).filter(x=>x!==b.group);
    this.store.save(id,u,version);this.store.event('tracker_updated');return this.view(id);
  }
  remind(id, input, version) {
    const u=this.store.ensure(id);
    if (input.deleteId) {u.reminders=u.reminders.filter(r=>r.id!==input.deleteId);}
    else {
      const due = Date.parse(input.dueAt);
      if (!catalog.some(b=>b.id===input.benefitId) || !Number.isFinite(due) || due < Date.now()+1000 || due > Date.now()+366*86400000) throw new Error('Выберите меру и дату в ближайший год');
      if (!['deadlines','unfinished','lifeEvents','service'].includes(input.kind)) throw new Error('Выберите тип напоминания');
      if (!u.settings[input.kind]) throw new Error('Включите этот тип уведомлений в настройках');
      if (u.reminders.filter(r=>!r.sentAt).length >= 30) throw new Error('Достигнут лимит 30 напоминаний');
      u.reminders.push({id:randomUUID(),benefitId:input.benefitId,dueAt:new Date(due).toISOString(),kind:input.kind,attempts:0,sentAt:null});
    }
    this.store.save(id,u,version);return this.view(id);
  }
}

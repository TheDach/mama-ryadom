import {matchLabels} from './questions.js';
export function evaluate(benefit, profile, rules, tracking = {}) {
  const rule = rules[benefit.id];
  const reasons = [], missing = [], rejected = [];
  for (const c of rule.conditions) {
    const v = profile[c.field];
    if (v === undefined || c.uncertain?.includes(v)) missing.push(c.clarify || c.reason);
    else if (c.values.includes(v)) reasons.push(c.reason);
    else rejected.push(c.failure);
  }
  missing.push(...(rule.alwaysClarify || []));
  if (profile.stage === 'pregnant' && benefit.id === 'b01') {
    if (profile.pregnancyWeeks === 'under12' || profile.pregnancyWeeks === '12to29') missing.push('Уточните у работодателя срок начала отпуска по беременности и родам. Пособие нельзя считать уже доступным по одному факту беременности.');
    if (profile.pregnancyWeeks === '30plus') reasons.push('Указан срок от 30 недель. Можно уточнить оформление отпуска у работодателя.');
  }
  if (profile.stage === 'under18' && ['b02','b16'].includes(benefit.id) && profile.childAge && profile.childAge !== 'unknown') {
    const ages = {under6:'меньше 6 месяцев', '6to12':'от 6 до 12 месяцев', '12to18':'от 12 до 18 месяцев'};
    reasons.push('Указанный возраст ребёнка: ' + ages[profile.childAge]);
    if (benefit.id === 'b02' && profile.childAge !== 'under6') missing.push('Проверьте срок обращения за пособием при рождении с учётом возраста ребёнка.');
    if (benefit.id === 'b16' && profile.childAge === '12to18') rejected.push('Программа работодателя в исходном наборе относится к детям до года.');
  }
  const status = profile.received?.includes(benefit.group) || tracking.status === 'received' ? 'received' : !rule.auto ? 'excluded' : rejected.length ? 'ineligible' : missing.length ? 'clarify' : 'eligible';
  return {...benefit, match:status, matchLabel:matchLabels[status], reasons, missing, rejected, tracking, auto:rule.auto};
}
export function selectBenefits(catalog, profile, rules, tracking = {}) {
  return catalog.map(b => evaluate(b, profile, rules, tracking[b.duplicateOf || b.id]));
}
export function nextAction(matches) {
  return matches.filter(b => b.auto && ['eligible','clarify'].includes(b.match) && b.tracking.status !== 'submitted')
    .sort((a,b) => (a.priority - b.priority))[0] || null;
}

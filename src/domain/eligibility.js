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

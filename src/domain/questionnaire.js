const employment = [['employed', 'По трудовому договору'], ['self', 'ИП или самозанятость'], ['unemployed', 'Сейчас не работаю'], ['student', 'Учусь очно']];
const income = [['low', 'Ниже прожиточного минимума'], ['mid', 'От 1 до 1,5 прожиточного минимума'], ['high', 'Выше 1,5 прожиточного минимума'], ['unknown', 'Не знаю']];
const received = [['birth_leave', 'Пособие по беременности и родам'], ['birth', 'Пособие при рождении'], ['care', 'Пособие по уходу'], ['unified', 'Единое пособие'], ['capital', 'Материнский капитал'], ['regional_capital', 'Региональный маткапитал']];
const family = [['1_yes', 'Один ребёнок, первый родной'], ['1_no', 'Один ребёнок, не первый родной'], ['2_no', 'Двое детей, не первый родной'], ['3_no', 'Трое и больше, не первый родной'], ['2_yes', 'Двое детей, первый родной'], ['3_yes', 'Трое и больше, первый родной']];
const residence = [['yes_permanent', 'РФ, постоянная регистрация'], ['yes_temporary', 'РФ, временная регистрация'], ['yes_none', 'РФ, без регистрации в области'], ['no_permanent', 'Не РФ, постоянная регистрация'], ['no_temporary', 'Не РФ, временная регистрация'], ['no_none', 'Не РФ, без регистрации в области']];
const familyHint = 'Учитывайте ожидаемого ребёнка, детей супруга, приёмных и подопечных. «Первый родной» относится к ребёнку, для которого вы ищете поддержку.';
const incomeHint = 'Сравните доход на одного члена семьи с прожиточным минимумом. Точную сумму вводить не нужно. Если не уверены, выберите «Не знаю».';

export const questions = [
  {id:'stage', fields:['stage'], title:'Для какого этапа нужна поддержка?', options:[['pregnant','Беременность'],['under18','Ребёнку меньше 1,5 лет'],['18to36','Ребёнку от 1,5 до 3 лет'],['3to7','Ребёнку от 3 до 7 лет']]},
  {id:'pregnancy', fields:['pregnancyWeeks'], title:'Какой сейчас срок беременности?', hint:'Это поможет уточнить ближайший шаг. Медицинские сведения и документы не нужны.', options:[['under12','Меньше 12 недель'],['12to29','От 12 до 29 недель'],['30plus','30 недель и больше'],['unknown','Не хочу уточнять']]},
  {id:'infant', fields:['childAge'], title:'Сколько месяцев ребёнку?', hint:'Сроки обращения за разными пособиями отличаются.', options:[['under6','Меньше 6 месяцев'],['6to12','От 6 до 12 месяцев'],['12to18','От 12 до 18 месяцев'],['unknown','Не хочу уточнять']]},
  {id:'familyPregnant', fields:['children','firstChild'], title:'Каким будет состав семьи после рождения?', hint:familyHint, options:family},
  {id:'familyParent', fields:['children','firstChild'], title:'Какой у вас состав семьи?', hint:familyHint, options:family},
  {id:'workPregnant', fields:['employment'], title:'Вы работаете или учитесь?', hint:'Это влияет на порядок оформления пособия по беременности и родам.', options:employment},
  {id:'workInfant', fields:['employment'], title:'Какой у вас статус занятости?', hint:'В отпуске по уходу с сохранённым трудовым договором выбирайте «По трудовому договору».', options:employment},
  {id:'workParent', fields:['employment'], title:'Какой у вас основной статус занятости?', hint:'Для работающих родителей проверим также меры через работодателя.', options:employment},
  {id:'residence', fields:['citizenship','registration'], title:'Гражданство и регистрация в Томской области', hint:'РФ означает гражданство России. Во всех вариантах речь о регистрации именно в Томской области.', options:residence},
  {id:'incomePregnant', fields:['income'], title:'Какой доход приходится на человека в семье?', hint:incomeHint, options:income},
  {id:'incomeFamily', fields:['income'], title:'Какой доход на человека в вашей семье?', hint:'Для некоторых мер семьям с несколькими детьми важен порог 1,5 ПМ. '+incomeHint, options:income},
  {id:'incomeParent', fields:['income'], title:'Как доход семьи соотносится с прожиточным минимумом?', hint:incomeHint, options:income},
  {id:'receivedPregnant', fields:['received'], title:'Какие выплаты вы уже оформили?', hint:'Можно отметить несколько, в том числе на старших детей. Если ничего, продолжите без отметок.', multiple:true, options:received},
  {id:'receivedInfant', fields:['received'], title:'Что уже оформлено после рождения?', hint:'Отметьте также полученные ранее выплаты. Эти сведения останутся в личном списке.', multiple:true, options:[received[1],received[2],received[3],received[4],received[0],received[5]]},
  {id:'receivedParent', fields:['received'], title:'Какие меры поддержки уже получаете или получили?', hint:'Учитывайте прошлые выплаты. Если ничего не оформляли, продолжите без отметок.', multiple:true, options:[received[3],received[4],received[5],received[2],received[1],received[0]]}
];

export function questionPath(profile = {}) {
  const pregnant = profile.stage === 'pregnant', infant = profile.stage === 'under18';
  const ids = ['stage'];
  if (pregnant) ids.push('pregnancy');
  if (infant) ids.push('infant');
  ids.push(pregnant ? 'familyPregnant' : 'familyParent');
  ids.push(pregnant ? 'workPregnant' : infant ? 'workInfant' : 'workParent');
  ids.push('residence');
  ids.push(pregnant ? 'incomePregnant' : profile.employment === 'employed' && ['2','3'].includes(profile.children) ? 'incomeFamily' : 'incomeParent');
  ids.push(pregnant ? 'receivedPregnant' : infant ? 'receivedInfant' : 'receivedParent');
  return ids.map(id => questions.find(q => q.id === id));
}

export function answerValue(profile, question) {
  if (question.fields.length === 2) return question.fields.every(f => profile[f] !== undefined) ? question.fields.map(f => profile[f]).join('_') : undefined;
  return profile[question.fields[0]];
}

export function applyAnswer(profile, question, value) {
  if (!question) throw new Error('Вопрос не найден');
  const allowed = new Set(question.options.map(o => o[0]));
  if (question.multiple) {
    if (!Array.isArray(value) || value.length > allowed.size || new Set(value).size !== value.length || value.some(v => !allowed.has(v))) throw new Error('Проверьте список выплат');
  } else if (!allowed.has(value)) throw new Error('Выберите один из ответов');
  const next = {...profile};
  if (question.fields.length === 2) question.fields.forEach((field, i) => { next[field] = value.split('_')[i]; });
  else next[question.fields[0]] = Array.isArray(value) ? [...value] : value;
  if (next.stage !== 'pregnant') delete next.pregnancyWeeks;
  if (next.stage !== 'under18') delete next.childAge;
  return next;
}

export function validateAnswers(profile) {
  let result = {};
  for (const q of questionPath(profile)) result = applyAnswer(result, q, answerValue(profile, q));
  return result;
}

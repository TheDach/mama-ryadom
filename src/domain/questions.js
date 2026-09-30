export {questions} from './questionnaire.js';
const fields = [
  {id:'stage', title:'На каком этапе вы сейчас?', options:[['pregnant','Я беременна'],['under18','Ребёнку до 1,5 лет'],['18to36','Ребёнку 1,5-3 года'],['3to7','Ребёнку 3-7 лет']]},
  {id:'firstChild', title:'Это ваш первый родной ребёнок?', hint:'Дети супруга, приёмные и подопечные учитываются отдельно в следующем вопросе.', options:[['yes','Да'],['no','Нет']]},
  {id:'children', title:'Сколько детей в вашей семье?', hint:'Включая ожидаемого ребёнка, приёмных, подопечных и детей супруга. Первый родной ребёнок может быть не единственным в семье.', options:[['1','1 ребёнок'],['2','2 ребёнка'],['3','3 и более']]},
  {id:'employment', title:'Какой у вас основной статус занятости?', options:[['employed','Работаю по трудовому договору'],['self','ИП / самозанятая'],['unemployed','Не работаю'],['student','Учусь очно']]},
  {id:'income', title:'Как доход на человека соотносится с прожиточным минимумом?', hint:'Точный доход не нужен. Используем тестовую модель юга Томской области; если сомневаетесь, выберите «Не знаю».', options:[['low','Ниже ПМ'],['mid','От ПМ до 1,5 ПМ'],['high','Выше 1,5 ПМ'],['unknown','Не знаю']]},
  {id:'citizenship', title:'У вас есть гражданство РФ?', options:[['yes','Да'],['no','Нет']]},
  {id:'registration', title:'У вас постоянная регистрация в Томской области?', options:[['permanent','Да, постоянная'],['temporary','Только временная'],['none','Нет']]},
  {id:'pregnancyWeeks', title:'Срок беременности', optional:true, options:[['under12'],['12to29'],['30plus'],['unknown']]},
  {id:'childAge', title:'Возраст ребёнка', optional:true, options:[['under6'],['6to12'],['12to18'],['unknown']]},
  {id:'received', title:'Что вы уже оформили?', hint:'Можно выбрать несколько. Если ничего - сразу нажмите «Готово».', multiple:true, options:[['birth_leave','Пособие по беременности и родам'],['birth','Пособие при рождении'],['care','Пособие по уходу'],['unified','Единое пособие'],['capital','Материнский капитал'],['regional_capital','Региональный маткапитал']]}
];
export const defaultSettings = {theme:'system', fontSize:'normal', accessible:false, deadlines:false, unfinished:false, lifeEvents:false, service:false};
export const statusLabels = {planned:'Планирую оформить', preparing:'Готовлю документы', submitted:'Подано', received:'Получено', action:'Требует действия'};
export const matchLabels = {eligible:'Потенциально подходит', clarify:'Требует уточнения', ineligible:'Не подходит по введённым данным', received:'Уже оформлено', excluded:'Вне автоподбора MVP'};
export function validateProfile(value, partial = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ожидается профиль');
  if (Object.keys(value).some(k => !fields.some(q => q.id === k))) throw new Error('Неизвестное поле профиля');
  const result = {};
  for (const q of fields) {
    if (!(q.id in value)) { if (partial || q.optional) continue; throw new Error(`Заполните: ${q.title}`); }
    const v = value[q.id];
    if (q.multiple) {
      if (!Array.isArray(v) || v.length > q.options.length || new Set(v).size !== v.length || v.some(x => !q.options.some(o => o[0] === x))) throw new Error('Некорректный список оформленных выплат');
    } else if (!q.options.some(o => o[0] === v)) throw new Error(`Некорректный ответ: ${q.title}`);
    result[q.id] = v;
  }
  if (result.stage !== 'pregnant') delete result.pregnancyWeeks;
  if (result.stage !== 'under18') delete result.childAge;
  return result;
}
export function validateSettings(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(k => !Object.hasOwn(defaultSettings,k))) throw new Error('Некорректные настройки');
  for (const [k,v] of Object.entries(s)) {
    if (k === 'theme' ? !['system','light','dark'].includes(v) : k === 'fontSize' ? !['small','normal','large'].includes(v) : typeof v !== 'boolean') throw new Error('Некорректное значение настройки');
  }
  return s;
}

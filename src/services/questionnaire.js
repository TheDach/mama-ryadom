import {randomBytes} from 'node:crypto';
import {questionPath, applyAnswer, validateAnswers} from '../domain/questionnaire.js';

export function transitionQuestionnaire(current, input) {
  const u = structuredClone(current);
  const action = input.action;
  if (action === 'start') {
    if (!u.consent && input.consent !== true) throw new Error('Подтвердите использование тестовых данных');
    u.consent = true;
    if (!u.questionnaire || input.restart === true || u.questionnaireVersion !== 2) {
      u.draft = u.questionnaire && input.restart !== true ? {...u.draft} : {...u.profile};
      u.questionIndex = 0;
      u.questionnaire = true;
      u.questionnaireVersion = 2;
    }
  } else {
    const q = questionPath(u.draft)[u.questionIndex];
    if (!u.questionnaire || u.questionnaireVersion !== 2 || input.flow !== u.flow || input.questionId !== q?.id) {
      const e = new Error('Этот вопрос уже изменился. Продолжите текущий опрос.'); e.status = 409; throw e;
    }
    if (action === 'back') u.questionIndex = Math.max(0, u.questionIndex - 1);
    else if (action === 'answer' || action === 'select') {
      if (action === 'select' && !q.multiple) throw new Error('Для вопроса нужен один ответ');
      u.draft = applyAnswer(u.draft, q, input.value);
      if (action === 'answer') u.questionIndex++;
      if (u.questionIndex === questionPath(u.draft).length) {
        u.profile = validateAnswers(u.draft);
        u.questionnaire = false;
      }
    } else throw new Error('Неизвестное действие опроса');
  }
  u.flow = randomBytes(4).toString('hex');
  return u;
}

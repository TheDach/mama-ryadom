import {readFileSync} from 'node:fs';
export const catalog = JSON.parse(readFileSync(new URL('../../data/benefits.json',import.meta.url)));
export const rules = JSON.parse(readFileSync(new URL('../../data/rules.json',import.meta.url)));
export const region = JSON.parse(readFileSync(new URL('../../data/regions/tomsk.json',import.meta.url)));
export const disclosure = 'Тестовые данные. Проверяйте актуальную информацию в официальном источнике. Окончательное решение принимает уполномоченный орган.';

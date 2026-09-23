import {createHmac, timingSafeEqual} from 'node:crypto';
export function validateInitData(raw, token, ttl = 3600, now = Date.now()) {
  if (!token || typeof raw !== 'string' || raw.length > 16384) throw new Error('Недействительная авторизация MAX');
  const params=new URLSearchParams(raw), keys=[...params.keys()];
  if (new Set(keys).size !== keys.length) throw new Error('Повторяющиеся параметры MAX');
  const received=params.get('hash');
  if (!/^[a-f0-9]{64}$/i.test(received || '')) throw new Error('Нет подписи MAX');
  params.delete('hash');params.sort();
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const check=createHmac('sha256',secret).update([...params].map(([k,v])=>`${k}=${v}`).join('\n')).digest();
  if (!timingSafeEqual(check,Buffer.from(received,'hex'))) throw new Error('Подпись MAX не совпадает');
  const time=Number(params.get('auth_date'));
  if (!Number.isInteger(time) || now/1000-time>ttl || time>now/1000+30) throw new Error('Сессия MAX устарела. Откройте приложение заново.');
  const user=JSON.parse(params.get('user') || '{}');
  if (!Number.isSafeInteger(user.id) || user.id<=0) throw new Error('Некорректный пользователь MAX');
  return String(user.id);
}

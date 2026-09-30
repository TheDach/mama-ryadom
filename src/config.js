export function configuration(env = process.env) {
  const c = {
    port: Number(env.PORT || 3000), host: env.HOST || '0.0.0.0',
    publicUrl: env.PUBLIC_URL || 'http://localhost:3000', token: env.BOT_TOKEN || '',
    botUsername: env.BOT_USERNAME || '', apiUrl: env.MAX_API_URL || 'https://platform-api2.max.ru',
    botMode: env.BOT_MODE || 'polling', webhookSecret: env.WEBHOOK_SECRET || '',
    demo: env.DEMO_MODE === 'true', dbPath: env.DB_PATH || './var/mama.sqlite',
    initTtl: Number(env.INIT_DATA_TTL_SECONDS || 3600), sessionTtl: Number(env.SESSION_TTL_SECONDS || 86400)
  };
  if (!['polling', 'webhook'].includes(c.botMode)) throw new Error('BOT_MODE: polling или webhook');
  if (![c.port, c.initTtl, c.sessionTtl].every(x => Number.isInteger(x) && x > 0)) throw new Error('Некорректные числовые параметры окружения');
  if (!c.demo && (!c.token || !c.publicUrl.startsWith('https://'))) throw new Error('Для MAX нужны BOT_TOKEN и HTTPS PUBLIC_URL');
  if (c.botMode === 'webhook' && !/^[a-zA-Z0-9_-]{32,256}$/.test(c.webhookSecret)) throw new Error('WEBHOOK_SECRET: не менее 32 символов');
  const publicUrl=new URL(c.publicUrl);
  if(publicUrl.pathname!=='/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) throw new Error('PUBLIC_URL: нужен прямой адрес приложения без пути и параметров, например https://mama-ryadom-production.up.railway.app');
  if(c.port>65535)throw new Error('PORT должен быть не больше 65535');
  new URL(c.apiUrl);
  return c;
}

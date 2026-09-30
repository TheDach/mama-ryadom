export const updateTypes=['bot_started','message_created','message_callback'];

export async function configureWebhook(client,config) {
  if(!config.token || !config.publicUrl.startsWith('https://'))throw new Error('Для webhook нужны BOT_TOKEN и HTTPS PUBLIC_URL');
  await client.request('POST','/subscriptions',{}, {
    url:new URL('/api/max/webhook',config.publicUrl).href,
    update_types:updateTypes,
    secret:config.webhookSecret
  });
}

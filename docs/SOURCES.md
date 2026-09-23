# Источники и происхождение данных

Продуктовое ТЗ: пользовательский `промт.docx`. Ограничения, формат сдачи, критерии: `Забота о людях(2).pdf`, особенно страницы 7–13. Демонстрационный каталог и анкета: `Khakaton (2)(2).docx`. Суммы и даты сохранены из этого файла; независимая правовая проверка не проводилась. Различия исходников и решения описаны в `ELIGIBILITY.md`.

Официальная техническая документация MAX, проверена при разработке 22.09.2026:

- https://dev.max.ru/docs/webapps/validation — подпись стартовых данных и auth_date.
- https://dev.max.ru/docs/webapps/bridge — WebApp, initData, start_param, ready, внешние ссылки.
- https://dev.max.ru/docs/webapps/introduction — связь mini app и бота, startapp.
- https://dev.max.ru/docs-api/methods/POST/messages — отправка сообщений.
- https://dev.max.ru/docs-api/methods/POST/answers — ответ callback с обновлённым сообщением.
- https://dev.max.ru/docs-api/methods/GET/updates — polling и marker.
- https://dev.max.ru/docs-api/methods/POST/subscriptions — HTTPS webhook и секрет.
- https://dev.max.ru/docs-api/use-cases/sending-messages/keyboard — клавиатура.
- https://dev.max.ru/docs/chatbots/bots-coding/js — тип кнопки open_app.

Внешняя библиотека интерфейса: официальный MAX Bridge загружается с https://st.max.ru/js/max-web-app.js при открытии клиента. Работает как внешний платформенный компонент, не копируется в репозиторий. Сервис не использует LLM для определения права на пособия.

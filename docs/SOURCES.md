# Источники

## Кейс и каталог

Требования к решению: `Zabota_o_lyudyakh.pdf`, страницы 6-15. Файл предоставлен вместе с задачей.

Каталог `data/benefits.json`, региональные параметры и `data/rules.json` взяты из исходной версии репозитория. В её документации источником указан `Khakaton (2)(2).docx`. Сам дополнительный DOCX в текущем архиве отсутствует. Суммы и нормативная актуальность каталога заново не проверялись.

Каждая карточка содержит исходную ссылку, дату материала и признак тестовых данных. Сторонние источники обозначены отдельно. Ссылка на официальный портал помогает проверить сведения, но не означает интеграцию с ведомством или прямую подачу заявления.

## MAX

Официальные страницы, проверенные 29.09.2026:

- [Подпись стартовых данных](https://dev.max.ru/docs/webapps/validation)
- [MAX Bridge](https://dev.max.ru/docs/webapps/bridge)
- [Отправка сообщений и адрес API](https://dev.max.ru/docs-api/methods/POST/messages)
- [Клавиатура и callback](https://dev.max.ru/docs-api/use-cases/sending-messages/keyboard)

Дополнительные разделы для проверки развёртывания:

- [Мини-приложения](https://dev.max.ru/docs/webapps/introduction)
- [Ответ на callback](https://dev.max.ru/docs-api/methods/POST/answers)
- [Получение обновлений](https://dev.max.ru/docs-api/methods/GET/updates)
- [Webhook-подписки](https://dev.max.ru/docs-api/methods/POST/subscriptions)

MAX Bridge загружается с `https://st.max.ru/js/max-web-app.js`. Это внешний компонент платформы. Код библиотеки не копируется в проект. LLM для подбора выплат не используется.

## Инструменты

- [Переменные Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Управление ветками GitHub](https://docs.github.com/en/pull-requests/how-tos/commit-changes/managing-branches-within-your-repository)

Node.js и его встроенные модули используются по открытой лицензии. Python и ReportLab нужны только для генерации презентации. Собственный код распространяется по лицензии MIT из `LICENSE`.

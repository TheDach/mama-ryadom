# Перенос изменений в отдельную ветку

Архив содержит файлы проекта без `.git` и рабочего `.env`. Ветку в существующем репозитории создаёт Git. ZIP нужен для переноса изменённых файлов.

## Вариант с PowerShell

Ниже используется новая локальная копия, чтобы не затронуть незакоммиченные изменения в рабочей папке.

```powershell
cd C:\
git clone https://github.com/TheDach/mama-ryadom.git mama-ryadom-update
cd C:\mama-ryadom-update
git switch -c feature/smart-questionnaire-ui
```

Если GitHub запрашивает вход, авторизация выполняется обычным способом через Git Credential Manager. Токены не вставляются в команды.

1. Скачать новый ZIP и выбрать «Извлечь всё».
2. Открыть папку `mama-ryadom` внутри распакованного архива.
3. Скопировать всё её содержимое в `C:\mama-ryadom-update` с заменой совпадающих файлов. `package.json` должен оказаться непосредственно в `C:\mama-ryadom-update`, а не во вложенной папке.
4. Папку `.git` клонированного репозитория сохранить. В новом архиве её нет.

```powershell
git rm --cached --ignore-unmatch .env
git status
npm ci
npm test
npm run check
```

`git rm --cached` перестаёт отслеживать `.env`, но оставляет локальный файл на диске. Команда не очищает старую историю репозитория. Перед `npm start` проверить локальный `.env`: для браузерной проверки `DEMO_MODE=true` и пустой `BOT_TOKEN`.

Для демопроверки без изменения старого окружения можно запускать Docker из отдельной распакованной папки архива, в которой нет `.env`:

```powershell
docker compose up --build -d
```

После проверки, в папке клона:

```powershell
git add .
git diff --cached --stat
git diff --cached --name-status
git commit -m "Add adaptive questionnaire and update mini app"
git push -u origin feature/smart-questionnaire-ui
```

Ожидается удаление отслеживаемого `.env` и изменение файлов проекта. Рабочие секреты, SQLite и `node_modules` в коммит не входят. Общую команду `git diff --cached` для просмотра содержимого удаления `.env` перед демонстрацией экрана лучше не использовать: она покажет старое содержимое.

## Кнопки GitHub

После `push`:

1. Открыть репозиторий.
2. Нажать список веток над файлами, где отображается `master` или `main`.
3. Выбрать `feature/smart-questionnaire-ui`.
4. Для просмотра изменений открыть `Compare & pull request`. Если кнопки нет: `Pull requests`, `New pull request`, в `compare` выбрать новую ветку.
5. Проверить вкладку `Files changed`. При необходимости сохранить `Create draft pull request`.

Созданная ветка существует отдельно от основной. Слияние через `Merge pull request` выполняется после проверки. ZIP в репозиторий загружать не нужно.

## Вариант без консоли: GitHub Desktop

1. `File`, `Clone repository`, вкладка `URL`, адрес репозитория, `Clone`.
2. `Current Branch`, `New Branch`, имя `feature/smart-questionnaire-ui`, `Create Branch`.
3. `Repository`, `Show in Explorer`. Скопировать файлы обновлённого проекта в эту папку с заменой.
4. Удаление `.env` из отслеживаемых файлов всё равно требует `git rm --cached --ignore-unmatch .env` в `Repository`, `Open in Terminal`.
5. Проверить список `Changes`, указать текст коммита, нажать `Commit to feature/smart-questionnaire-ui`.
6. `Publish branch`. Затем `View on GitHub`.

## Фиксация сдачи

После проверки и заполнения материалов:

```powershell
git rev-parse HEAD
```

Полученный hash относится к конкретной версии исходников. Реквизиты и служебная презентация должны соответствовать сдаваемой версии. После дедлайна она не изменяется.

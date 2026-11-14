# Web Docs

Агент кладёт HTML через MCP. Документ появляется в папке пользователя и открывается по адресу `{slug}.{host}/{name}`. Повторная запись меняет тело и не меняет адрес.

Один процесс отдаёт и список, и API. Пользователи лежат в файле SQLite (`DATA_FILE`). На Cloudflare тот же код открывает D1, если есть биндинг `DB`. Тела документов пишет S3-совместимое хранилище: R2 или Object Storage.

## Локально

```bash
npm install
cp worker/.env.example worker/.env
npm run dev
```

- Список, вход и API: http://localhost:5173
- Процесс Node: http://127.0.0.1:8788

Порт 8787 оставлен свободному: десктопный Cursor принимает OAuth-код на `http://localhost:8787/callback`. MCP в Cursor — `http://localhost:5173/mcp`.
- Публичная страница: http://{slug}.localhost:5173/{name}

`npm run dev` открывает файл SQLite и создаёт таблицы Better Auth. Каталог для `DATA_FILE` создаётся сам. Без `S3_*` вход работает, запись документов отвечает ошибкой хранилища.

Вход — email и пароль. Агент подключается к `POST /mcp` кнопкой Add to Cursor. Cursor проводит OAuth: пользователь входит и подтверждает папку. Тот же URL подключают в Cloud Agents отдельно. Вход в десктопе туда не переносится.

Проверки: `npm test` и `npm run typecheck`.

## Деплой

Нужен аккаунт Cloudflare, база D1 и бакет R2 с S3-ключом. `database_id` в `worker/wrangler.jsonc` замените на свою базу.

1. `npx wrangler login` из каталога `worker`.
2. `npx wrangler d1 create webdocs` и подставьте `database_id`.
3. Секреты: `BETTER_AUTH_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Переменные `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`.
4. `npm run deploy:web` собирает веб-приложение и деплоит Worker. Страницы и API живут на `HOST`.

Публичный URL документа: `https://{slug}.vibesite.online/{name}`. Его отдаёт тот же Worker, прочитав объект `{organizationId}/{name}`.

Как агенту класть документы, сервер сообщает в `instructions` ответа `initialize`. Новый документ — `put_markdown_document`. Правка — `get_document` и полный `put_html_document`. `PUT /api/documents/{name}` остаётся для веб-клиента.

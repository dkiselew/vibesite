# Web Docs

Прототип Stage 0: агент кладёт HTML через MCP, документ появляется в списке и открывается по стабильному URL. Повторная запись меняет тело и не меняет адрес.

Локально два процесса: API и список. В проде список — Cloudflare Pages, API и MCP — Worker, сами страницы — бакет R2 на субдомене.

## Локально

```bash
npm install
cp worker/.dev.vars.example worker/.dev.vars
npm run dev
```

- Список: http://localhost:5173
- MCP: http://localhost:8787/mcp
- Публичная страница: http://demo.localhost:8787/{name}

Локальный процесс на `:8787` смотрит на заголовок `Host`. `demo.localhost` отдаёт объект из R2, `localhost` — API и MCP. В проде этого ветвления нет: Worker деплоится из `src/index.ts` и документы отдаёт сам R2.

Ключ для локального MCP — значение `MCP_KEY` в `worker/.dev.vars` (`dev-key-change-me`, пока файл не меняли).

В Cursor, Settings → MCP, добавь сервер:

```json
{
  "mcpServers": {
    "webdocs": {
      "url": "http://localhost:8787/mcp",
      "headers": {
        "Authorization": "Bearer dev-key-change-me"
      }
    }
  }
}
```

Как агенту класть документы, описано в `plugin/webdocs/skills/web-docs/SKILL.md`. Плагин заливает файл локальным `curl` (`PUT /api/documents/{name}`), а не HTML в аргументах MCP.

Проверки: `npm test` и `npm run typecheck`.

## Деплой

Нужен аккаунт Cloudflare и зона (для этого репозитория — `vibesite.online`) на том же аккаунте. Свой сервер не нужен. Команды ниже не запускались из этого прототипа.

1. Войди в Wrangler: `npx wrangler login` из каталога `worker`.
2. Создай бакет: `npx wrangler r2 bucket create webdocs`.
3. Поправь `env.production.vars` в `worker/wrangler.jsonc`, если зона или слаг не `vibesite.online` / `demo`. `WORKSPACE_SLUG` — лейбл субдомена, человек его в UI не выбирает.
4. Положи ключ MCP (это не переменная в репозитории):

   ```bash
   cd worker
   npx wrangler secret put MCP_KEY --env production
   ```

5. Задеплой API:

   ```bash
   npm run deploy -w worker
   ```

   В dashboard у Worker `webdocs-api` добавь custom domain `api.vibesite.online`. Запись DNS создаётся сама, proxied. SSL — Full (strict), режим Cloudflare по умолчанию для proxied-записей.

6. Собери список и задеплой Pages. `VITE_API_ORIGIN` берётся из `web/.env.production` на момент сборки — он должен совпадать с доменом Worker.

   ```bash
   npm run build -w web
   cd web
   npx wrangler pages deploy dist --project-name webdocs
   ```

   У проекта Pages добавь custom domain `vibesite.online` (apex). `www` не занимай.

7. Открой бакет R2 → Settings → Custom Domains → Add → `demo.vibesite.online`. Это отдельная запись на лейбл `demo`, не wildcard. Публичный URL документа: `https://demo.vibesite.online/cv`. Корень субдомена списком не является.

   Не вешай `demo.vibesite.online` на Worker. `src/dev.ts` — только локальная подмена этой раздачи.

8. Caching → Cache Rules → Create rule: если hostname равен `demo.vibesite.online`, действие Bypass cache. Иначе замена документа может остаться в кэше Cloudflare. `Cache-Control: no-cache` на объекте уже выставляется при записи.

9. Подключи MCP уже на боевой адрес:

   ```json
   {
     "mcpServers": {
       "webdocs": {
         "url": "https://api.vibesite.online/mcp",
         "headers": {
           "Authorization": "Bearer <MCP_KEY>"
         }
       }
     }
   }
   ```

Смена ключа — новый `wrangler secret put MCP_KEY --env production` и тот же ключ в конфиге Cursor. Перевыпуска в UI нет.

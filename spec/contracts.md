# Contracts — Web Docs Stage 1

**Статус:** исполнимый контракт. Имена, URL, MCP, HTML policy, лимиты, ошибки.
**Источник:** [constitution.md](./constitution.md), [prd.md](./prd.md)
**Дата:** 2026-09-18

Хост в примерах: `{host}`. Боевое значение — решение деплоя, грамматика не меняется.

Канонический URL документа:

```text
https://{workspace}.{host}/{name}
```

Приложение (список, login, settings, MCP) живёт на apex `https://{host}`. Документы — только на субдомене workspace. Поэтому нет reserved slugs: `login`, `settings`, `cv` не пересекаются с путями приложения.

---

## Имена

Workspace slug и document name — одна грамматика.

```text
name        = label *( "-" label )
label       = 1*alnum
alnum       = %x30-39 / %x61-7A   ; 0-9 a-z
```


| Правило           | Значение                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Длина             | document name: 1–64. workspace slug: 1–63 (лимит DNS-лейбла)                                                                                                                                                                    |
| Регистр           | только lowercase; вход нормализуем trim + lowercase                                                                                                                                                                             |
| `.html`           | только для **document name**: если заканчивается на `.html`, суффикс снимается **один раз**: `cv.html` → `cv`. `cv.html.html` → `cv.html` (точка → `invalid_name`). У workspace slug суффикс `.html` не снимаем — это не файл   |
| Запрещено         | точка, слэш, underscore, unicode, пробел, ведущий/хвостовой дефис, удвоенный `--`. **Reserved-списков нет**                                                                                                                     |
| Нормализация `--` | не схлопываем; отказ `invalid_name`                                                                                                                                                                                             |

Документ и workspace не могут называться пустой строкой после нормализации. Имена вроде `login`, `settings`, `index`, `www` допустимы: на субдомене нет маршрутов приложения.

Workspace slug в Stage 1 **immutable** после onboarding.

---



## URL и HTTP


| Host | Метод и путь | Назначение |
| --- | --- | --- |
| `{workspace}.{host}` | `GET /{name}` | Публичная выдача документа |
| `{workspace}.{host}` | `GET /` | **404.** Не индекс, не сайт |
| `{host}` | `GET /`, `/login`, `/settings`, `/invite/{token}`, `/mcp`, … | Приложение. **Не** документ |

Документ отдаётся только как `https://{workspace}.{host}/{name}`. Apex не обслуживает документы по `/{name}`.

### GET документа — 200

Заголовки:

```http
Content-Type: text/html; charset=utf-8
Cache-Control: no-cache
X-Robots-Tag: noindex, nofollow
Content-Security-Policy: {см. политику ниже}
```

Тело: санитизированная **выдача** (не обязательно байт-в-байт диск). Плашка Free вставляется на выдаче, в сохранённый файл не пишется.

### GET документа — 404

Документа нет или имя невалидно как путь. Тело — страница 404 продукта, не стек чужих имён.

Не использовать 403 на публичном GET в Stage 1 (всё публично). Нет документа = 404.

### Каноника

- Без trailing slash: `https://dk.{host}/cv/` → **301** на `https://dk.{host}/cv`.
- Без `.html` в пути: `https://dk.{host}/cv.html` → 404 (имя = сегмент без расширения).
- Apex: `https://{host}/cv` — не документ.
- Схема HTTPS. HTTP → редирект на HTTPS (деплой).
- Cookie сессии приложения: **host-only** на `{host}`, не `Domain=.{host}`. Иначе сессия утечёт на все workspace-субдомены.
- DNS: wildcard `*.{host}` → origin документов. Apex `{host}` → приложение. `www.{host}` в Stage 1 не занимает продукт — слаг `www` допустим.

---



## Модель данных (логическая)



### Workspace


| Поле           | Тип      | Смысл                    |
| -------------- | -------- | ------------------------ |
| `id`           | opaque   | внутренний               |
| `slug`         | name     | субдомен                 |
| `mcp_key_hash` | string   | хранить только хеш ключа |
| `created_at`   | datetime |                          |


Owner — не поле workspace, а Membership с `role = owner`. У аккаунта не больше одного membership с `role = owner` (один owned workspace). Членств с `role = member` может быть несколько.

### Membership


| Поле           | Тип      | Смысл                                      |
| -------------- | -------- | ------------------------------------------ |
| `workspace_id` | ref      |                                            |
| `account_id`   | ref      |                                            |
| `role`         | enum     | `owner` \| `member`                        |
| `created_at`   | datetime |                                            |


Уникальность: `(workspace_id, account_id)`. В workspace ровно один `owner` в Stage 1. Передачи ownership нет.

### Invite


| Поле           | Тип      | Смысл                                      |
| -------------- | -------- | ------------------------------------------ |
| `workspace_id` | ref      |                                            |
| `email`        | string   | lowercase                                  |
| `token_hash`   | string   | одноразовый секрет приглашения             |
| `invited_by`   | ref      | account owner                              |
| `expires_at`   | datetime | 7 суток с создания / resend                |
| `accepted_at`  | datetime \| null |                                   |
| `created_at`   | datetime |                                            |


Пока `accepted_at` is null и не истекло — pending. Resend на тот же email: новый token, тот же ряд, новый `expires_at`. После accept ряд остаётся как аудит или удаляется — на поведение диска не влияет.

### Document


| Поле             | Тип             | Смысл                                                                                      |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `workspace_id`   | ref             |                                                                                            |
| `name`           | name            | сегмент URL, уникален в workspace                                                          |
| `html`           | string          | **оригинал**, как сохранили                                                                |
| `bytes`          | int             | размер оригинала                                                                           |
| `updated_at`     | datetime        | меняется на create / Replace / Duplicate-как-создание. Rename меняет `name` и `updated_at` |
| `link_copied_at` | datetime | null | UI Copy link; MCP не трогает                                                               |
| `created_at`     | datetime        |                                                                                            |


Нет сущности Version. Duplicate = INSERT нового Document.

Идентичность: `(workspace_id, name)`.

Replace: UPDATE `html`, `bytes`, `updated_at`. `name` не менять.

---



## Лимиты Free (Stage 1)


| Лимит                   | Значение      |
| ----------------------- | ------------- |
| Документов на workspace | 50            |
| Членов на workspace     | 20            |
| Размер оригинала HTML   | 5 MiB         |
| Документов за один drop | 1             |
| MCP ключей              | 1 действующий |


Превышение → ошибка `limit_exceeded`, состояние диска не меняется.

---



## HTML: ingest vs serve



### Ingest (UI Save/Replace и `put_document`)

1. Принять тело как UTF-8 текст. Не парсим «валидность HTML5» как отказ.
2. Пустая строка (только whitespace) → `invalid_html`.
3. Если нет `<html` (case-insensitive) — обернуть:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{escaped name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
{original fragment}
</body>
</html>
```

1. Сохранить оригинал (после возможной обёртки) в `document.html`.
2. Не исполнять, не превьюить на сервере через JS.

Отдельных ассетов нет. Картинки — только внутри HTML (`data:` / `https:` URL в разметке автора).

### Serve (публичный GET)

Цель: документ читается, авторский JS **не исполняется**, файл на диске не портится.

**CSP** (обязателен):

```text
default-src 'none';
script-src 'none';
style-src 'unsafe-inline' https:;
img-src https: data:;
font-src https: data:;
media-src https: data:;
frame-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
upgrade-insecure-requests
```

**Санитизация выдачи** (поверх CSP, для клиентов без CSP):

С копии тела, не с диска:

- удалить `<script>…</script>` и `<script …>`
- удалить `<iframe>`, `<object>`, `<embed>`, `<frame>`, `<frameset>`
- удалить `<base>`
- удалить `<meta http-equiv>` с refresh / Content-Security-Policy
- вырезать атрибуты событий `on*`
- вырезать URL `javascript:` в `href`, `src`, `xlink:href`, `style`
- не исполнять и по возможности нейтрализовать `<svg>` script / `foreignObject` с HTML

`<link rel="stylesheet" href="https://…">` на выдаче допустим (CSP `style-src https:`). Внешний CSS может трекать — принимаем в Stage 1.

Формы в разметке могут остаться визуально; submit блокируется CSP `form-action 'none'`.

### Плашка Free

Вставка только в serve-копию: перед `</body>` или, если нет `</body>`, в конец. Не в `document.html` на диске. Open из списка идёт на публичный GET → плашка видна.

### OG (для краулеров превью)

Не отдельная страница. На выдаче, если в `<head>` нет:

- `og:title` — взять `<title>`, иначе `{name}`
- `og:url` — канонический URL
- `og:type` — `article`
- `og:description` — только если есть `meta name="description"` или уже есть `og:description` в оригинале; иначе не выдумывать
- `og:image` — в Stage 1 **не генерируем**. Если автор сам положил `og:image` на https/data — оставить, если проходит img CSP

Краулерам (Telegram, Slack) отдаём ту же HTML-выдачу. Не ослаблять CSP ради OG-картинки с произвольного хоста, кроме уже разрешённого `img-src https: data:`.

---



## Auth



### Человек

- Magic link на email. Ссылка ведёт на apex `{host}`, не на workspace-субдомен.
- Сессия после клика. Cookie: host-only на `{host}`.
- В сессии: `account_id`, `current_workspace_id`.
- Workspace создаётся на onboarding **только если** у аккаунта ещё нет ни одного membership и нет действующего invite в этой сессии.
- Invite-ссылка: `https://{host}/invite/{token}`. После логина — accept. Новый человек слаг не выбирает.
- Документные UI-операции требуют membership в `current_workspace_id`. Иначе 403, диск не меняется.



### Агент

- Один секрет workspace. Показывать в Settings один раз после генерации / regenerate; далее copy hidden.
- Передача: `Authorization: Bearer {key}` на MCP transport. Endpoint MCP — на apex (`https://{host}/mcp`), не на субдомене документов.
- На диске только хеш. Regenerate инвалидирует старый ключ сразу.
- Ключ даёт полный доступ к документам **этого** workspace: list/read/write/duplicate/delete. Чужие workspace недоступны.
- Ключ один на папку: любой член может его видеть и отдать своему агенту. Regenerate — только owner.

---



## MCP tools

Ровно пять. Нет `publish`, `deploy`, `preview`.

Rename в Stage 1 — **только UI**. Агент, которому нужен новый сегмент: `put_document` с новым именем + `delete_document` старого (два URL, это не rename; так и задумано: диск, не git mv). Либо человек переименует в UI.

Общие правила:

- Все mutating tools идемпотентны там, где указано.
- Ответы JSON. HTML в JSON — строка.
- `url` всегда канонический абсолютный HTTPS.



### Ошибки MCP


| `code`           | Когда                          | HTTP-аналог |
| ---------------- | ------------------------------ | ----------- |
| `unauthorized`   | нет/неверный ключ              | 401         |
| `invalid_name`   | грамматика имени               | 400         |
| `not_found`      | нет документа                  | 404         |
| `name_taken`     | create-only конфликт; см. tool | 409         |
| `limit_exceeded` | 50 docs / 20 members / 5 MiB   | 413 / 429   |
| `forbidden`      | не член папки / не owner       | 403         |
| `already_member` | invite на уже члена            | 409         |
| `invite_expired` | token просрочен или неверен    | 404         |
| `invalid_html`   | пустое тело                    | 400         |
| `bad_request`    | нет обязательного поля         | 400         |


Тело ошибки:

```json
{
  "error": {
    "code": "invalid_name",
    "message": "Name must be 1–64 chars: lowercase letters, numbers, hyphens."
  }
}
```

`message` — для агента, можно показать человеку.

---



### `list_documents`

Вход: пустой объект.

```json
{}
```

Выход:

```json
{
  "workspace": "dk",
  "documents": [
    {
      "name": "cv",
      "url": "https://dk.{host}/cv",
      "updated_at": "2026-09-18T12:00:00Z",
      "bytes": 18432
    }
  ]
}
```

Сортировка: `updated_at` desc. Без HTML. Без `link_copied_at`.

---



### `put_document`

Создать или заменить. **Идемпотентный Replace** по имени.

Вход:

```json
{
  "name": "cv",
  "html": "<!DOCTYPE html>..."
}
```


| Поле   | Обязательно | Примечание                 |
| ------ | ----------- | -------------------------- |
| `name` | да          | нормализация как в «Имена» |
| `html` | да          | строка, лимит 5 MiB UTF-8  |


Выход:

```json
{
  "name": "cv",
  "url": "https://dk.{host}/cv",
  "created": false,
  "updated_at": "2026-09-18T12:05:00Z",
  "bytes": 19100
}
```

`created`: `true` если документа не было, `false` если это Replace.

Поведение:

- Имя занято → перезапись HTML, URL тот же. **Не** `name_taken`.
- Confirm UI не применяется.
- `link_copied_at` не меняется.
- Лимит 50 считается только при `created: true`.

---



### `get_document`

Вход:

```json
{ "name": "cv" }
```

Выход:

```json
{
  "name": "cv",
  "url": "https://dk.{host}/cv",
  "html": "<!DOCTYPE html>...",
  "updated_at": "2026-09-18T12:05:00Z",
  "bytes": 19100
}
```

`html` — **оригинал с диска**, не serve-копия (без плашки, без вырезания script). Нет документа → `not_found`.

---



### `duplicate_document`

Вход:

```json
{
  "name": "cv",
  "new_name": "cv-2026-09-18"
}
```


| Поле       | Обязательно  |
| ---------- | ------------ |
| `name`     | да, источник |
| `new_name` | нет          |


Если `new_name` нет: `{name}-{YYYY-MM-DD}` в UTC. Если занято: `{name}-{YYYY-MM-DD}-2`, затем `-3`, … (первый свободный). Если `new_name` задан и занят → `name_taken` (не автосуффикс).

Выход:

```json
{
  "name": "cv-2026-09-18",
  "url": "https://dk.{host}/cv-2026-09-18",
  "source": "cv",
  "updated_at": "2026-09-18T12:06:00Z",
  "bytes": 19100
}
```

Копия: тот же `html`. `link_copied_at` = null. Источник не меняется. Лимит документов применяется.

---



### `delete_document`

Вход:

```json
{ "name": "cv" }
```

Выход:

```json
{ "deleted": "cv" }
```

Нет документа → `not_found`. Повторный delete того же имени → `not_found` (не идемпотентный 200).

GET публичного URL после delete → 404. Имя свободно для нового `put_document`.

---



## UI-only операции (не MCP)

Контракт поведения, чтобы UI и диск не разъехались.

### Copy link

Пишет `link_copied_at = now()` если было null; повторное копирование обновляет timestamp. Значение truthy = «ссылку уже копировали» для Replace confirm.

### Rename

`old` → `new`. Атомарно:

- `new` валиден и свободен, иначе ошибка, `old` на месте
- UPDATE `name`
- `link_copied_at = null`
- GET `https://{workspace}.{host}/{old}` → 404
- GET `https://{workspace}.{host}/{new}` → тот же html

Редиректа нет.

### Replace UI

Как `put_document`, плюс: если `link_copied_at != null`, без подтверждения запрос не должен менять диск.

### Invite member (только owner)

- Вход: email. Нормализация trim + lowercase.
- Уже member → `already_member`.
- Свой email → `bad_request`.
- Членов уже 20 (owner + members + pending считаются) → `limit_exceeded`.
- Иначе письмо со ссылкой `https://{host}/invite/{token}`. Token сырой только в письме; на диске хеш.

### Accept invite

- Валидный token + сессия на тот же email → INSERT Membership `member`, `accepted_at = now()`, `current_workspace_id` = эта папка.
- Token чужой/просроченный → `invite_expired`.
- Email сессии ≠ email invite → отказ (нельзя принять чужое приглашение).

### Remove member / Leave (UI)

- Owner удаляет member: DELETE Membership. Документы и ключ не трогать.
- Member Leave: то же самое про себя.
- Owner Leave или Remove себя → `forbidden`, пока он единственный owner.
- После remove сессия жертвы: если есть другие memberships — переключить `current_workspace_id`; если нет — сессия без текущей папки, список недоступен.

### Switch workspace (UI)

Только на workspace, где есть Membership. Меняет `current_workspace_id`. Документы не копируются и не сливаются.

### Regenerate MCP key

Только owner. Иначе `forbidden`.

---



## Инварианты для тестов

1. Дважды `put_document` с именем `cv` → один документ, один URL, второе тело на GET.
2. `duplicate_document` → два GET, разный HTML path, одинаковое исходное тело в момент копии.
3. После Duplicate Replace источника не меняет тело копии.
4. `GET https://{workspace}.{host}/` ≠ список документов. `GET https://{host}/{name}` ≠ документ.
5. Публичный GET не выполняет `console.log` из авторского `<script>` (проверять CSP/санитизацию).
6. `get_document` после put со `<script>` всё ещё содержит script в JSON.
7. Copy link → UI Replace без confirm не меняет `html`.
8. MCP `put_document` после Copy link меняет `html` без UI.
9. Delete → 404; новый put на то же имя → 200 новое тело.
10. Имя `CV.HTML` → документ `cv`.
11. Member `put_document` виден в `list_documents` owner'а той же папки; URL тот же.
12. Человек без Membership не получает список этой папки.
13. Accept invite не создаёт второй slug и не меняет существующий.
14. Remove member не удаляет документы и не ротирует MCP-ключ.
15. Switch workspace: `put_document` после смены пишет только в новую папку.

---



## Вне контракта Stage 1

Не специфицировать и не строить: password gate, signed unlisted URLs, view counters, custom domain, снятие плашки, TTL ссылки, `rename_document` tool, `patch_document`, upload ассетов, webhooks, список по API без MCP, viewer-роли, вложенные папки, второй owned workspace, transfer ownership, MCP tools для invite.

Идеи точечной правки HTML и чтения куском — в [html-edits.md](./html-edits.md). Пока их нет в списке tools.

Stage 2 шаблоны (не этот контракт): каталог на apex `https://{host}/templates/{id}` и спека `https://{host}/templates/{id}.md`. Это не Document, не workspace, не MCP Stage 1.
# UX spec — Web Docs Stage 1

**Статус:** экраны, состояния, копирайт. Не визуальный брендбук.
**Источник:** [prd.md](./prd.md), [constitution.md](./constitution.md)
**Дата:** 2026-09-18

Метафора: **папка документов, не Vercel.** Список файлов. Не карточки сайтов, не «deployments», не превью-грид.

Язык UI: English. Тон: прямой, короткий, без «ship», «stack», «production».

---

## Поверхности

| Поверхность | Кто | URL |
|---|---|---|
| Landing / login | Гость | `/` |
| Magic link sent | Гость | `/login` |
| Onboarding slug | Новый человек без invite | `/onboarding` |
| Accept invite | Гость / аккаунт | `/invite/{token}` |
| List | Член папки | `/` после сессии |
| New document | Член папки | модал / панель на списке, не отдельный мастер |
| Replace | Член папки | диалог на строке документа |
| Duplicate / Rename / Delete | Член папки | диалог на строке |
| Settings | Член папки | `/settings` |
| Public document | Получатель и член (Open) | `https://{workspace}.{host}/{name}` |
| Document 404 | Кто угодно | тот же шаблон URL, документа нет |

Нет: редактора, превью-iframe на списке, страницы «site settings», вложенных папок, поиска как продукта (можно позже; в Stage 1 список короткий).

---

## IA списка

Одна таблица. Колонки:

1. **Name** — имя документа (`cv`), не `cv.html`
2. **Modified** — относительное + точная дата в `title` (`2 hours ago`)
3. **URL** — канонический `https://{workspace}.{host}/{name}` (в таблице можно сокращать до `{workspace}.{host}/{name}`); клик = копирование полного URL
4. **Actions** — не иконки-деплоя. Текст или сдержанное меню: Open, Copy link, Replace, Duplicate, Rename, Delete

Сортировка по умолчанию: Modified desc.

Не показывать: статус деплоя, framework, размер в первой версии можно в `title` у имени, visiblity (всё public).

Строка не является превью страницы. Нет thumbnail.

---

## Копирайт (канон)

Использовать эти строки, не синонимы вроде Publish / Deploy / Preview URL.

### Landing (гость)

**Hero Section**
- Заголовок: **The shared folder for your AI documents.**
- Подзаголовок: **Claude and ChatGPT already make the page. We give it a permanent home.**
- Пояснение: One HTML or Markdown file. One clean URL. Replace the file anytime — the link stays exactly the same.
- CTA: **Continue with email**
- Поле: Email address
- Вторично, мелко: Paste HTML from ChatGPT, or put a file from Cursor. We don't write the page.

**Features (Как это работает)**
- Заголовок блока: **From chat to work.**
- Пункт 1: **One file, one link.** Drop an HTML or Markdown file. It gets a predictable URL (like `/cv`). Markdown renders automatically.
- Пункт 2: **Replace in place.** Update your document by saving over it. The link stays the same. No broken URLs.
- Пункт 3: **Team workspace.** A shared folder for your organization. Everyone sees the latest documents.
- Пункт 4: **Agent-ready (MCP).** Connect Cursor or Claude. Your AI agents can save files directly to your folder.

**Use Cases (Для чего подходит)**
- Заголовок блока: **Stop losing documents in chat history.**
- Карточка 1: **CVs & Resumes.** Update your experience, keep the same link for recruiters.
- Карточка 2: **Proposals & Quotes.** Send professional links to clients instead of messy PDF attachments.
- Карточка 3: **Meeting Leave-behinds.** Save AI-generated summaries as official team documents.
- Карточка 4: **Price Lists.** Keep your rates up to date at the same address.

Не писать: Free HTML hosting. Deploy your site. Make a page with AI. Don't send a copy.

### Magic link

- **Check your email.** Open the link to enter the folder.
- Нет пароля.

### Onboarding

Только если нет действующего приглашения и нет membership.

- Заголовок: **Choose your workspace address**
- Пояснение: Documents will live at `{slug}.{host}/your-file`. You can invite your organization later. You can't change this address.
- Поле: Workspace name (slug)
- Превью живьём: `https://{slug}.{host}/cv`
- CTA: **Create workspace**
- Ошибка занятости: **That address is taken.**
- Ошибка формата: **Use lowercase letters, numbers, and hyphens.**

### Empty list

- Заголовок: **No documents yet**
- Тело: **Drop an .html file or paste markup. It lives in this folder. The name becomes the link.**
- Кнопки: **Drop file** (или зона drop), **Paste HTML**
- Строка про MCP: **Using Cursor or Claude? Put files via MCP.** → Settings
- Owner, мелко: **Invite your organization.** → Settings

### Список с документами

- Заголовок приложения: **Documents** (не Sites, не Projects)
- Если членств > 1: switcher слага текущей папки в шапке. Не «team picker», не аватарки проектов.
- Кнопка: **New document**
- Settings в шапке, не в строке документа

### New document — paste

- Заголовок: **Paste HTML**
- Поле имени: Name (сегмент URL). Подсказка: from filename or from `<title>`
- Поле: HTML
- Превью URL: `https://{workspace}.{host}/{name}`
- CTA: **Save** (не Publish)
- Хелп: **Saving makes the link live. There is no draft.**

### New document — drop

- Зона: **Drop a .html file**
- После файла: то же поле имени, предзаполненное из файла, CTA **Save**

### Имя занято при создании

- **A document named “cv” already exists.**
- Действия: **Replace it** (ведёт в поток Replace, с confirm если надо) / **Change name** / Cancel

### Open

- Пункт: **Open**
- Поведение: новая вкладка, канонический URL. Не iframe в приложении.

### Copy link

- Пункт: **Copy link**
- Toast: **Link copied**
- В буфере полный канонический URL, не путь без хоста.

### Replace

- Заголовок: **Replace “cv”**
- Тело: **The URL stays the same. Anyone with the link will see the new page.**
- Вход: drop или paste
- CTA: **Replace**
- Cancel: **Cancel**

Если ссылку копировали:

- Предупреждение: **You already copied this link. Replacing updates what people see.**
- CTA неактивен, пока не отмечен чекбокс: **Replace the live page**
- Либо две кнопки: Cancel / **Replace live page** как разрушающее действие (предпочтительно кнопкой, без чекбокса-лабиринта)

Не говорить: overwrite production, force deploy.

### Duplicate

- Заголовок: **Duplicate “cv”**
- Поле имени, предзаполненное правилом из contracts (`cv-2026-09-18`)
- Пояснение: **New document, new URL. The original link is unchanged.**
- CTA: **Duplicate**

### Rename

- Заголовок: **Rename “cv”**
- Пояснение: **This changes the URL. The old link will 404.**
- Поле нового имени + превью нового URL
- CTA: **Rename**
- Если имя занято: **That name is already in use.**

### Delete

- Заголовок: **Delete “cv”?**
- Тело: **The link will 404. This cannot be undone.**
- CTA разрушающий: **Delete**
- Cancel: **Cancel**

### Settings

- Заголовок: **Settings**
- Блок workspace: слаг (read-only), канонический префикс `https://{slug}.{host}/`
- Блок **People** (главный блок после адреса):
  - Список: email, role (`Owner` / `Member`), pending если не принял
  - Owner: поле email + **Invite**
  - Owner: **Remove** на member и на pending
  - Member: **Leave folder**
  - Owner не видит Leave, пока он единственный owner
  - Пустое пояснение: **Everyone here sees the same documents and the same links.**
  - Invite sent: **Invite sent to {email}.**
  - Already member: **That person is already in this folder.**
  - Limit: **You've reached the {n} people limit.**
- Блок MCP:
  - **Workspace key** — показать / скрыть, **Copy**. Видят все члены.
  - **MCP URL** — copy
  - Текст: **Agents read and write documents in this folder. There is no deploy step.**
  - **Regenerate key** — только owner. Подтверждение: **Old keys stop working immediately.**
- Блок аккаунта: email, **Log out**
- Нет: домены, биллинг, роли на документе, git, env vars.

### Accept invite

- Заголовок: **Join {slug}**
- Тело: **You'll share this folder. Same documents. Same links.**
- CTA: **Join folder**
- Истекло: **This invite expired.** Без списка документов.
- Чужой email: **This invite was sent to another address.**

### Публичный документ

Сохранённый HTML занимает страницу.

Поверх выдачи (не внутри файла на диске):

- **Free badge:** тонкая полоса снизу или сбоку, не перекрывает контент на типичном CV. Текст: **Web Docs** + опционально домен сервиса. Клик ведет на лендинг в новой вкладке. Не редактор, не «fork this».
- Не добавлять нашу шапку с меню документов поверх чужого оффера.

Получатель не видит: список, Replace, логин-модал.

### 404 документа

- **This document isn't here.**
- Без enumeration других документов workspace.
- Без формы «создать такой документ».

### Ошибки лимитов

- Файл слишком большой: **This file is larger than {n} MB.**
- Слишком много документов: **You've reached the {n} document limit.**
- Не HTML: **Use an .html file.**

### MCP в UI не показываем как лог деплоя

Нет «Latest agent deployment». Документ просто появляется в списке, как файл на диске.

---

## Потоки (шаги)

```text
A. Paste from ChatGPT
   List → New document → Paste HTML → Name → Save
   → row in list → Copy link → paste into email/Slack

B. Cursor MCP
   Settings → Copy key (один раз)
   Agent: put_document → URL in chat
   Author: Copy link only if needs to reshare; otherwise already has URL from agent
   Later: agent put_document same name → live link updates (no UI confirm)

C. Replace after send
   List → Replace → (confirm if copied) → drop/paste → Replace live page
   Slack link unchanged

D. Snapshot before rewrite
   Duplicate → new name → (optional) Copy that link to client
   original: Replace freely

E. Rename after mistake
   Rename → warn URL breaks → new name

F. Share the folder
   Settings → People → email → Invite
   Colleague opens invite link → Join folder
   Same list, same URLs

G. Work in the shared folder
   Member: drop / paste / MCP put_document
   Owner and other members see the row

H. Switch folder
   Header switcher → other slug → list and Settings key belong to that folder
```

---

## Состояния

| Экран | Состояния |
|---|---|
| List | empty, populated, loading, error load |
| Save/Replace | idle, submitting, error validation, error limit, error name taken |
| Magic link | form, sending, sent, link expired, error |
| Onboarding | editing slug, checking uniqueness, taken, created |
| Public doc | 200 body, 404 |
| Settings | key hidden, key visible, regenerating, people list, invite sending, invite error |
| Invite | valid, expired, wrong email, joining |
| Switcher | hidden (1 membership), open, switching |

Нет состояния «draft», «building», «deploying».

---

## Drop / paste — детали

- Drop на список или в диалог New: принимаем один файл за раз. Несколько файлов — ошибка: **Drop one .html file.**
- Drag over списка: подсветка зоны, не «upload project».
- Paste в диалоге — только поле HTML, не перехватывать Cmd+V на всём списке (чтобы не ловить случайный буфер).
- Имя: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 1–64. Поле показывает сегмент, не filename с расширением.
- Живой preview пути обновляется при вводе имени.

---

## Адаптив

- Список: на узком экране колонка URL может сокращаться до иконки Copy; Name и Modified остаются.
- Drop и paste должны работать на телефоне (paste важнее drop).
- Публичный документ: мы не «улучшаем» вёрстку автора. Только плашка не должна закрывать контент (safe area).

---

## Доступность

- Таблица списка: заголовки колонок, действия в меню с доступным именем (`Actions for cv`).
- Разрушающие CTA — кнопки, не только иконка корзины без имени.
- Confirm Replace / Delete / Remove / Leave — фокус в диалог, Escape = Cancel.
- Switcher — кнопка с именем текущей папки, не только иконка.
- Публичная плашка — ссылка с понятным именем «Web Docs», не пустой логотип.
- Не использовать цвет как единственный сигнал ошибки имени.

---

## Чего нельзя нарисовать

Даже если «так понятнее»:

- карточки с скриншотом страницы
- кнопка Publish / Deploy
- вкладки Preview / Source
- индикатор git SHA
- чат в сайдбаре
- шаблоны «CV / Offer / Report» как мастер создания (каталог картинка+спека — Stage 2, не этот spec)
- toggle Public/Private в Stage 1 (всё публично; private = Pro, его нет)
- индекс всех документов по публичному адресу `https://{workspace}.{host}/`
- оргсхема, аватарки как продукт, «spaces», вложенные папки
- роли на строке документа (viewer / can edit)

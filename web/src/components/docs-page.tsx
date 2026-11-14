import type { ReactNode } from "react";

const toc = [
  { href: "#connect", label: "Подключение" },
  { href: "#edit", label: "Редактирование" },
];

export function DocsPage() {
  return (
    <div className="min-h-screen scroll-smooth">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <a href="/docs" className="font-semibold tracking-tight">
            Документация
          </a>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            В кабинет
          </a>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="На этой странице" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            На этой странице
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-1 lg:border-l lg:pl-3">
            {toc.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm text-muted-foreground hover:text-foreground lg:block lg:py-1"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="max-w-3xl">
          <p className="text-sm text-muted-foreground">Web Docs</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Как устроена папка</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Страницу собирает агент в Cursor. Сайт хранит её и отдаёт по постоянной ссылке. Своего
            редактора в браузере нет: править текст здесь нельзя.
          </p>

          <section id="connect" className="mt-14 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-tight">Подключение MCP</h2>
            <p className="mt-3 leading-relaxed">
              MCP — канал, по которому Cursor говорит с вашей папкой. Агент не получает пароль. Он
              получает отдельный доступ, который вы подтверждаете сами.
            </p>
            <ol className="mt-6 list-decimal space-y-4 pl-5 leading-relaxed marker:text-muted-foreground">
              <li>
                В кабинете нажмите <strong>Add to Cursor</strong>. Cursor запомнит сервер с именем{" "}
                <Code>webdocs</Code> и адресом этого сайта, путь <Code>/mcp</Code>.
              </li>
              <li>
                Cursor откроет вход. Войдите тем же email и паролем, что и в кабинет. Если аккаунта
                ещё нет, его можно создать на этом шаге.
              </li>
              <li>
                На экране <strong>Connect Cursor</strong> нажмите <strong>Allow</strong>. Этим вы
                разрешаете агенту читать и менять документы текущей папки.
              </li>
            </ol>
            <Note>
              Разрешение привязано к папке, которая была открыта в момент входа. Смена папки в
              кабинете сама доступ не переносит: подключение нужно сделать заново. Облачный агент
              Cursor подключается отдельно, тем же адресом <Code>/mcp</Code>. Вход в десктопе туда
              не переносится.
            </Note>
          </section>

          <section id="edit" className="mt-14 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-tight">Редактирование</h2>
            <p className="mt-3 leading-relaxed">
              В чате Cursor напишите, какую страницу положить или что в ней поменять. Отдельной
              кнопки «опубликовать» нет: удачная запись сразу открывается по ссылке. Повторная
              запись с тем же именем меняет содержимое и оставляет адрес.
            </p>

            <h3 className="mt-8 text-lg font-semibold">Новая страница</h3>
            <ol className="mt-3 list-decimal space-y-3 pl-5 leading-relaxed marker:text-muted-foreground">
              <li>Агент смотрит список, чтобы случайно не занять уже занятое имя.</li>
              <li>
                Он присылает текст в Markdown. Оболочку страницы, шрифты и Tailwind добавлять не
                нужно.
              </li>
              <li>
                Сервер сам собирает из этого текста страницу для чтения и хранит только HTML.
                Markdown после этого не сохраняется.
              </li>
            </ol>

            <h3 className="mt-8 text-lg font-semibold">Правка существующей</h3>
            <ol className="mt-3 list-decimal space-y-3 pl-5 leading-relaxed marker:text-muted-foreground">
              <li>Агент читает HTML, который уже лежит в папке.</li>
              <li>Меняет только ту часть, о которой вы попросили.</li>
              <li>
                Присылает страницу целиком обратно. Адрес остаётся прежним, шаблон заново не
                собирается.
              </li>
            </ol>
            <Note>
              Просьба переписать страницу с нуля снова идёт через Markdown. Сервер заново собирает
              шаблон, и прежние правки HTML пропадают. Имя при этом можно оставить тем же.
            </Note>

            <h3 className="mt-8 text-lg font-semibold">Имя и ссылка</h3>
            <p className="mt-3 leading-relaxed">
              Имя файла — это и есть адрес: <Code>https://папка.хост/имя</Code>. В имени — строчные
              латинские буквы, цифры и дефисы, от 1 до 64 символов. Хвост <Code>.html</Code> или{" "}
              <Code>.md</Code> отбрасывается и формат не выбирает.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed marker:text-muted-foreground">
              <li>Переименование меняет адрес. Старая ссылка начинает отвечать «не найдено».</li>
              <li>Удаление тоже сразу. То же имя потом можно занять заново.</li>
              <li>
                Картинки — только по адресу <Code>https://…</Code> или встроенные в страницу. Файл с
                компьютера сам не загружается.
              </li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
      {children}
    </code>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <aside className="mt-6 border-l-2 border-foreground/30 bg-muted/70 px-4 py-3 text-sm leading-relaxed">
      {children}
    </aside>
  );
}

# webdocs

Плагин Cursor: скилл `web-docs` и MCP-сервер папки документов.

MCP: `https://api.vibesite.online/mcp`. Ключ в плагин не вшит. При установке Cursor спросит `MCP_KEY` — тот же секрет, что у Worker.

## Локально

Плагин лежит в `~/.cursor/plugins/local/webdocs`.

1. Перезагрузи окно: Command Palette → **Developer: Reload Window**.
2. Открой **Customize**.
3. У плагина **webdocs** задай **MCP key** и включи сервер.
4. В чате попроси положить HTML в папку. Скилл подхватится сам, инструменты: `list_documents`, `put_document`, `get_document`, `delete_document`.

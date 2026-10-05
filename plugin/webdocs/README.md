# webdocs

Плагин Cursor: скилл `web-docs` и локальный MCP, который заливает HTML через `curl`.

Ключ в плагин не вшит. При установке Cursor спросит `MCP_KEY` — тот же секрет, что у Worker.

Загрузка идёт `PUT https://api.vibesite.online/api/documents/{name}` с телом файла. `get_document` скачивает страницу в локальный кэш и возвращает путь, без HTML. Список, удаление и переименование идут короткими вызовами на `/mcp`.

## Установка

Скопируй эту папку в `~/.cursor/plugins/local/webdocs`, затем **Developer: Reload Window**. В **Customize** задай **MCP key** и включи сервер.

По умолчанию Cursor запускает `scripts/webdocs-mcp.sh` (macOS и Linux). На Windows в `mcp.json` замени команду:

```json
{
  "mcpServers": {
    "webdocs": {
      "command": "powershell.exe",
      "args": ["-NoProfile", "-File", "${CURSOR_PLUGIN_ROOT}/scripts/webdocs-mcp.ps1"],
      "env": {
        "MCP_KEY": "${MCP_KEY}",
        "WEBDOCS_API": "https://api.vibesite.online"
      }
    }
  }
}
```

Нужны `curl` (на Windows — `curl.exe`) и уже установленный PowerShell. Отдельную среду ставить не надо.

## Инструменты

`list_documents`, `put_document` (`name` + `path`), `get_document` (скачивает в кэш, возвращает `path`), `delete_document`, `rename_document`.

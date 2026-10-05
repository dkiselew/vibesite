---
name: web-docs
description: >-
  Save documents into the Web Docs folder through the webdocs MCP tools
  (list_documents, put_document, get_document, delete_document, rename_document).
  Use when the user asks to publish, save, update, share, rename, or delete a
  page, CV, note, proposal, or other document as a stable link. New documents
  are markdown. Edits are surgical changes to the saved HTML.
---

# Web Docs

Documents live at `https://demo.vibesite.online/{name}`. `put_document` uploads a local file and makes that URL live immediately. There is no draft, preview, publish, or deploy step.

The MCP server is `webdocs` from this plugin. It uploads with a local script. If its tools are missing, ask the user to install the webdocs plugin and set the MCP key.

## New document

Write the first draft as markdown, not as an HTML page. Do not add a document shell, Tailwind, or font tags. The server renders that markdown into the reading template and stores only the HTML page. The markdown is not kept.

1. Call `list_documents`.
2. Pick a name that is not already in the list. If the user asked for a name that exists, ask before replacing it.
3. Write the markdown under the cache directory, for example `${TMPDIR:-/tmp}/webdocs/<name>.md` on macOS/Linux and `%TEMP%\webdocs\<name>.md` on Windows.
4. Call `put_document` with `name` and that `path`. Do not pass `html`.
5. The result `path` is `${TMPDIR:-/tmp}/webdocs/<id>.html` on macOS/Linux and `%TEMP%\webdocs\<id>.html` on Windows. That file is the rendered page. Use it for later edits. Do not keep editing the markdown file.

Upload a `.md` file to an existing name only when the user asks to rewrite the document from scratch. That renders the template again and replaces any HTML edits.

## Editing

The page is a cache file, not a file in the project repo.

- Do not write this HTML into the repository.
- Do not delete the cache file after upload or rename. The user may edit the artifact later.
- Before editing, call `list_documents`. The same `id` is the same file, even if `name` on the server changed.
- If `${TMPDIR:-/tmp}/webdocs/<id>.html` (or `%TEMP%\webdocs\<id>.html`) is missing, call `get_document` with `name`. It downloads the HTML page into that file and returns `path`. The result has no HTML.
- If that file already exists, edit it. Do not call `get_document` again: it will not refresh the file.
- Edit the cache file in place. Change only the part the user asked for. Do not rewrite the page, do not turn it back into markdown, do not paste the HTML into the chat, and do not pass `html` to `put_document`.
- Then call `put_document` with the current `name` from the list and that `.html` path. The server stores those bytes and does not run the markdown template.

## Before writing

1. Call `list_documents`.
2. If the chosen name is already in the list, replace it only when the user asked to update that document. If they asked for a new document, pick another valid name or ask. Do not overwrite silently.
3. Rename with `rename_document`, not `put_document` plus `delete_document`. The id and cache path stay the same.
4. Call `delete_document` only when the user asked to delete.

## What to send

`put_document` arguments:

- `name`: lowercase letters, numbers, hyphens, 1–64 characters. A single trailing `.html` or `.md` is stripped (`CV.HTML` becomes `cv`, `Notes.md` becomes `notes`).
- `path`: absolute path to the local markdown file for a new document, or to the cached HTML file for an edit. Do not pass `html`.

Images and other assets in a page must be `https:` URLs or `data:` URIs. No local paths, no relative files, no uploads.

Author `<script>` tags in an uploaded HTML file are stored and served as written in this prototype.

## After writing

Read `url` from the `put_document` result and show it to the user as a clickable markdown link. Do not invent a different address. A second `put_document` with the same name keeps that URL and changes the page.

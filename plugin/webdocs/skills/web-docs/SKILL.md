---
name: web-docs
description: >-
  Save HTML documents into the Web Docs folder through the webdocs MCP tools
  (list_documents, put_document, get_document, delete_document). Use when
  the user asks to publish, save, update, share, or delete an HTML page, CV,
  note, proposal, or other document as a stable link.
---

# Web Docs

Documents live in one folder at `https://demo.vibesite.online/{name}`. `put_document` writes the file and makes that URL live immediately. There is no draft, preview, publish, or deploy step.

The MCP server is `webdocs` at `https://api.vibesite.online/mcp`. It comes with this plugin. If its tools are missing, ask the user to install the webdocs plugin and set the MCP key. Do not look for another way to publish.

## Never save the page on disk

Do not create or update `.html` files in the workspace, and do not use a local file as a stand-in. If the webdocs MCP tools are not available, stop and ask the user to connect the plugin. Do not fall back to writing HTML locally.

## Before writing

1. Call `list_documents`.
2. If the chosen name is already in the list, replace it only when the user asked to update that document. If they asked for a new document, pick another valid name or ask. Do not overwrite silently.
3. Call `delete_document` only when the user asked to delete.

## What to send

`put_document` arguments:

- `name`: lowercase letters, numbers, hyphens, 1–64 characters. No extension in the stored name. A single trailing `.html` is stripped by the server (`CV.HTML` becomes `cv`).
- `html`: the full page, or a fragment. A fragment without `<html` is wrapped. Empty markup is rejected.

Layout rules for pages you write:

- Load Tailwind from the CDN: `<script src="https://cdn.tailwindcss.com"></script>`.
- Load fonts from Google Fonts with a `<link>` tag. Do not reference local font files.
- Images and other assets must be `https:` URLs or `data:` URIs. No local paths, no relative files, no uploads.

Author `<script>` tags are stored and served as written in this prototype.

## After writing

Read `url` from the `put_document` result and show it to the user as a clickable markdown link. Do not invent a different address. A second `put_document` with the same name keeps that URL and changes the page.

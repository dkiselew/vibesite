#!/bin/sh
# Local stdio MCP for Web Docs. Uploads a document with curl; the key stays in env.
set -eu

API="${WEBDOCS_API:-https://api.vibesite.online}"
CACHE_DIR="${WEBDOCS_CACHE_DIR:-${TMPDIR:-/tmp}/webdocs}"
CURL_BIN="${WEBDOCS_CURL:-curl}"

if [ -z "${MCP_KEY:-}" ]; then
  echo "MCP_KEY is not set." >&2
  exit 1
fi

json_escape() {
  printf '%s' "$1" | awk 'BEGIN { ORS="" } { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); print }'
}

extract_string() {
  printf '%s' "$1" | awk -v key="$2" '
    {
      needle = "\"" key "\""
      start = index($0, needle)
      if (start == 0) exit
      rest = substr($0, start + length(needle))
      if (match(rest, /^[[:space:]]*:[[:space:]]*"/) == 0) exit
      rest = substr(rest, RLENGTH + 1)
      out = ""
      escaped = 0
      for (i = 1; i <= length(rest); i++) {
        c = substr(rest, i, 1)
        if (escaped) { out = out c; escaped = 0; continue }
        if (c == "\\") { escaped = 1; continue }
        if (c == "\"") { print out; exit }
        out = out c
      }
    }
  '
}

extract_string_after() {
  printf '%s' "$1" | awk -v marker="$2" -v key="$3" '
    {
      m = index($0, marker)
      if (m == 0) exit
      $0 = substr($0, m)
      needle = "\"" key "\""
      start = index($0, needle)
      if (start == 0) exit
      rest = substr($0, start + length(needle))
      if (match(rest, /^[[:space:]]*:[[:space:]]*"/) == 0) exit
      rest = substr(rest, RLENGTH + 1)
      out = ""
      escaped = 0
      for (i = 1; i <= length(rest); i++) {
        c = substr(rest, i, 1)
        if (escaped) { out = out c; escaped = 0; continue }
        if (c == "\\") { escaped = 1; continue }
        if (c == "\"") { print out; exit }
        out = out c
      }
    }
  '
}

extract_id() {
  printf '%s' "$1" | awk '
    match($0, /"id"[[:space:]]*:[[:space:]]*("[^"]*"|[0-9]+|null)/) {
      val = substr($0, RSTART, RLENGTH)
      sub(/"id"[[:space:]]*:[[:space:]]*/, "", val)
      print val
      exit
    }
  '
}

has_id() {
  id=$(extract_id "$1")
  [ -n "$id" ] && [ "$id" != "null" ]
}

extract_document() {
  printf '%s' "$1" | awk -v name="$2" '
    BEGIN { ORS="" }
    {
      needle = "\"name\":\"" name "\""
      start = index($0, needle)
      if (start == 0) exit
      left = 0
      for (i = start; i >= 1; i--) {
        if (substr($0, i, 1) == "{") { left = i; break }
      }
      if (left == 0) exit
      depth = 0
      for (i = left; i <= length($0); i++) {
        c = substr($0, i, 1)
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0) { print substr($0, left, i - left + 1); exit }
        }
      }
    }
  '
}

write_message() {
  # One JSON-RPC object per line. perl flushes so Cursor sees the reply at once.
  printf '%s' "$1" | tr -d '\r\n' | perl -e 'local $/; $| = 1; my $body = <STDIN>; exit 0 unless defined $body && length $body; print $body, "\n"'
}

tool_success() {
  rpc_id=$1
  text=$(json_escape "$2")
  write_message "{\"jsonrpc\":\"2.0\",\"id\":${rpc_id},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"${text}\"}]}}"
}

tool_error() {
  rpc_id=$1
  text=$(json_escape "$2")
  write_message "{\"jsonrpc\":\"2.0\",\"id\":${rpc_id},\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"${text}\"}],\"isError\":true}}"
}

auth_header_file() {
  hdr=$(mktemp)
  printf 'Authorization: Bearer %s\n' "$MCP_KEY" >"$hdr"
  printf '%s' "$hdr"
}

TOOLS_JSON='{"tools":[{"name":"list_documents","description":"List documents: id, name, canonical URL, updated_at, bytes. No HTML. Call before put_document. Sorted by updated_at descending.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}},{"name":"put_document","description":"Create or replace a document from a local file. A new document is a .md file: the server renders it to HTML and does not keep the markdown. An edit is the cached .html file and is stored as sent. Pass name and path. Do not pass html. Saving makes the URL live.","inputSchema":{"type":"object","properties":{"name":{"type":"string","description":"Document name, 1-64 chars. Lowercase letters, numbers, hyphens."},"path":{"type":"string","description":"Absolute path to a .md file for a new document, or to the cached .html file for an edit."}},"required":["name","path"],"additionalProperties":false}},{"name":"get_document","description":"If the local cache file is missing, download the document into it and return the path. Does not return HTML. Leave an existing cache file unchanged. Edit that file, then put_document with name and path.","inputSchema":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"],"additionalProperties":false}},{"name":"delete_document","description":"Delete a document immediately. The public URL then 404s.","inputSchema":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"],"additionalProperties":false}},{"name":"rename_document","description":"Change the URL path segment. The document id and local cache path stay the same. The old URL 404s.","inputSchema":{"type":"object","properties":{"name":{"type":"string"},"new_name":{"type":"string"}},"required":["name","new_name"],"additionalProperties":false}}]}'

proxy_rpc() {
  rpc_id=$1
  payload=$2
  out=$(mktemp)
  hdr=$(auth_header_file)
  code=$("$CURL_BIN" -sS -o "$out" -w '%{http_code}' \
    -X POST \
    -H "@$hdr" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data-binary "$payload" \
    "$API/mcp")
  rm -f "$hdr"
  body=$(cat "$out")
  rm -f "$out"
  if [ "$code" = "200" ]; then
    write_message "$body"
    return
  fi
  tool_error "$rpc_id" "$body"
}

put_from_file() {
  rpc_id=$1
  name=$2
  path=$3
  if [ ! -f "$path" ]; then
    tool_error "$rpc_id" '{"error":{"code":"bad_request","message":"File not found."}}'
    return
  fi
  content_type="text/html; charset=utf-8"
  markdown=0
  case "$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')" in
    *.md) content_type="text/markdown; charset=utf-8"; markdown=1 ;;
  esac
  out=$(mktemp)
  hdr=$(auth_header_file)
  code=$("$CURL_BIN" -sS -o "$out" -w '%{http_code}' \
    -X PUT \
    -H "@$hdr" \
    -H "Content-Type: $content_type" \
    --data-binary "@$path" \
    "$API/api/documents/$name")
  rm -f "$hdr"
  body=$(cat "$out")
  rm -f "$out"
  if [ "$code" != "200" ]; then
    tool_error "$rpc_id" "$body"
    return
  fi
  doc_id=$(extract_string "$body" "id")
  url=$(extract_string "$body" "url")
  dest=$path
  if [ -n "$doc_id" ]; then
    mkdir -p "$CACHE_DIR"
    dest="$CACHE_DIR/${doc_id}.html"
    if [ "$markdown" = 1 ]; then
      if [ -z "$url" ]; then
        tool_error "$rpc_id" '{"error":{"code":"bad_request","message":"Document is missing url."}}'
        return
      fi
      page=$(mktemp)
      code=$("$CURL_BIN" -sS -o "$page" -w '%{http_code}' "$url")
      if [ "$code" != "200" ]; then
        err=$(cat "$page")
        rm -f "$page"
        tool_error "$rpc_id" "$err"
        return
      fi
      mv "$page" "$dest"
      if [ "$path" != "$dest" ]; then
        rm -f "$path"
      fi
    elif [ "$path" != "$dest" ] && [ -f "$path" ]; then
      mv "$path" "$dest"
    fi
  fi
  dest_json=$(json_escape "$dest")
  merged=$(printf '%s' "$body" | awk -v path="$dest_json" '{
    if ($0 ~ /^{/) sub(/^{/, "{\"path\":\"" path "\",")
    print
  }')
  tool_success "$rpc_id" "$merged"
}

cache_document() {
  rpc_id=$1
  name=$2
  if [ -z "$name" ]; then
    tool_error "$rpc_id" '{"error":{"code":"bad_request","message":"Missing required field: name."}}'
    return
  fi
  list=$(mktemp)
  code=$("$CURL_BIN" -sS -o "$list" -w '%{http_code}' "$API/api/documents")
  body=$(cat "$list")
  rm -f "$list"
  if [ "$code" != "200" ]; then
    tool_error "$rpc_id" "$body"
    return
  fi
  obj=$(extract_document "$body" "$name")
  if [ -z "$obj" ]; then
    tool_error "$rpc_id" '{"error":{"code":"not_found","message":"Document not found."}}'
    return
  fi
  doc_id=$(extract_string "$obj" "id")
  url=$(extract_string "$obj" "url")
  if [ -z "$doc_id" ] || [ -z "$url" ]; then
    tool_error "$rpc_id" '{"error":{"code":"bad_request","message":"Document is missing id or url."}}'
    return
  fi
  mkdir -p "$CACHE_DIR"
  dest="$CACHE_DIR/${doc_id}.html"
  if [ ! -f "$dest" ]; then
    page=$(mktemp)
    code=$("$CURL_BIN" -sS -o "$page" -w '%{http_code}' "$url")
    if [ "$code" != "200" ]; then
      err=$(cat "$page")
      rm -f "$page"
      tool_error "$rpc_id" "$err"
      return
    fi
    mv "$page" "$dest"
  fi
  dest_json=$(json_escape "$dest")
  merged=$(printf '%s' "$obj" | awk -v path="$dest_json" '{
    if ($0 ~ /^{/) sub(/^{/, "{\"path\":\"" path "\",")
    print
  }')
  tool_success "$rpc_id" "$merged"
}

handle_message() {
  payload=$1
  method=$(extract_string "$payload" "method")
  if ! has_id "$payload"; then
    return
  fi
  rpc_id=$(extract_id "$payload")
  case "$method" in
    initialize)
      write_message "{\"jsonrpc\":\"2.0\",\"id\":${rpc_id},\"result\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{\"tools\":{\"listChanged\":false}},\"serverInfo\":{\"name\":\"webdocs\",\"version\":\"0.2.0\"}}}"
      ;;
    ping)
      write_message "{\"jsonrpc\":\"2.0\",\"id\":${rpc_id},\"result\":{}}"
      ;;
    tools/list)
      write_message "{\"jsonrpc\":\"2.0\",\"id\":${rpc_id},\"result\":${TOOLS_JSON}}"
      ;;
    tools/call)
      tool=$(extract_string_after "$payload" '"params"' "name")
      if [ "$tool" = "put_document" ]; then
        name=$(extract_string_after "$payload" '"arguments"' "name")
        path=$(extract_string_after "$payload" '"arguments"' "path")
        if [ -z "$name" ] || [ -z "$path" ]; then
          tool_error "$rpc_id" '{"error":{"code":"bad_request","message":"Missing required field: name, path."}}'
        else
          put_from_file "$rpc_id" "$name" "$path"
        fi
      elif [ "$tool" = "get_document" ]; then
        name=$(extract_string_after "$payload" '"arguments"' "name")
        cache_document "$rpc_id" "$name"
      else
        proxy_rpc "$rpc_id" "$payload"
      fi
      ;;
    *)
      write_message "{\"jsonrpc\":\"2.0\",\"id\":${rpc_id},\"error\":{\"code\":-32601,\"message\":\"Method not found: ${method}.\"}}"
      ;;
  esac
}

while IFS= read -r line || [ -n "$line" ]; do
  line=$(printf '%s' "$line" | tr -d '\r')
  if [ -z "$line" ]; then
    continue
  fi
  handle_message "$line"
done

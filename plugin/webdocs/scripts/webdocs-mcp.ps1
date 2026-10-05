# Local stdio MCP for Web Docs. Uploads a document with curl.exe; the key stays in env.
$ErrorActionPreference = "Stop"

if (-not $env:MCP_KEY) {
  [Console]::Error.WriteLine("MCP_KEY is not set.")
  exit 1
}

$Api = if ($env:WEBDOCS_API) { $env:WEBDOCS_API } else { "https://api.vibesite.online" }
$CacheDir = if ($env:WEBDOCS_CACHE_DIR) { $env:WEBDOCS_CACHE_DIR } else { (Join-Path $env:TEMP "webdocs") }
$Curl = if ($env:WEBDOCS_CURL) { $env:WEBDOCS_CURL } else { "curl.exe" }

$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

function Write-Message([string]$body) {
  $text = ($body -replace "[\r\n]", "") + "`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $stdout.Write($bytes, 0, $bytes.Length)
  $stdout.Flush()
}

function Read-LineBytes {
  $chars = New-Object System.Collections.Generic.List[byte]
  while ($true) {
    $b = $stdin.ReadByte()
    if ($b -lt 0) { return $null }
    if ($b -eq 10) { break }
    if ($b -ne 13) { [void]$chars.Add([byte]$b) }
  }
  return [System.Text.Encoding]::ASCII.GetString($chars.ToArray())
}

function Write-ToolSuccess($rpcId, $text) {
  $payload = @{
    jsonrpc = "2.0"
    id = $rpcId
    result = @{
      content = @(@{ type = "text"; text = $text })
    }
  }
  Write-Message (ConvertTo-Json $payload -Compress -Depth 8)
}

function Write-ToolError($rpcId, $text) {
  $payload = @{
    jsonrpc = "2.0"
    id = $rpcId
    result = @{
      content = @(@{ type = "text"; text = $text })
      isError = $true
    }
  }
  Write-Message (ConvertTo-Json $payload -Compress -Depth 8)
}

function Invoke-AuthedCurl {
  param([string[]]$CurlArgs)
  $hdr = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $hdr -Value "Authorization: Bearer $($env:MCP_KEY)" -Encoding ASCII
  $out = [System.IO.Path]::GetTempFileName()
  try {
    $code = & $Curl -sS -o $out -w "%{http_code}" -H "@$hdr" @CurlArgs
    $body = Get-Content -Path $out -Raw
    return @{ Code = $code; Body = $body }
  } finally {
    Remove-Item -Force $hdr, $out -ErrorAction SilentlyContinue
  }
}

$tools = @{
  tools = @(
    @{
      name = "list_documents"
      description = "List documents: id, name, canonical URL, updated_at, bytes. No HTML. Call before put_document. Sorted by updated_at descending."
      inputSchema = @{ type = "object"; properties = @{}; additionalProperties = $false }
    }
    @{
      name = "put_document"
      description = "Create or replace a document from a local file. A new document is a .md file: the server renders it to HTML and does not keep the markdown. An edit is the cached .html file and is stored as sent. Pass name and path. Do not pass html. Saving makes the URL live."
      inputSchema = @{
        type = "object"
        properties = @{
          name = @{ type = "string"; description = "Document name, 1-64 chars. Lowercase letters, numbers, hyphens." }
          path = @{ type = "string"; description = "Absolute path to a .md file for a new document, or to the cached .html file for an edit." }
        }
        required = @("name", "path")
        additionalProperties = $false
      }
    }
    @{
      name = "get_document"
      description = "If the local cache file is missing, download the document into it and return the path. Does not return HTML. Leave an existing cache file unchanged. Edit that file, then put_document with name and path."
      inputSchema = @{ type = "object"; properties = @{ name = @{ type = "string" } }; required = @("name"); additionalProperties = $false }
    }
    @{
      name = "delete_document"
      description = "Delete a document immediately. The public URL then 404s."
      inputSchema = @{ type = "object"; properties = @{ name = @{ type = "string" } }; required = @("name"); additionalProperties = $false }
    }
    @{
      name = "rename_document"
      description = "Change the URL path segment. The document id and local cache path stay the same. The old URL 404s."
      inputSchema = @{
        type = "object"
        properties = @{ name = @{ type = "string" }; new_name = @{ type = "string" } }
        required = @("name", "new_name")
        additionalProperties = $false
      }
    }
  )
}

function Handle-Message($payload) {
  $msg = $payload | ConvertFrom-Json
  if (-not $msg.PSObject.Properties["id"]) { return }
  $rpcId = $msg.id
  switch ($msg.method) {
    "initialize" {
      $result = @{
        jsonrpc = "2.0"
        id = $rpcId
        result = @{
          protocolVersion = "2025-03-26"
          capabilities = @{ tools = @{ listChanged = $false } }
          serverInfo = @{ name = "webdocs"; version = "0.2.0" }
        }
      }
      Write-Message (ConvertTo-Json $result -Compress -Depth 8)
    }
    "ping" {
      Write-Message (ConvertTo-Json @{ jsonrpc = "2.0"; id = $rpcId; result = @{} } -Compress)
    }
    "tools/list" {
      Write-Message (ConvertTo-Json @{ jsonrpc = "2.0"; id = $rpcId; result = $tools } -Compress -Depth 10)
    }
    "tools/call" {
      $tool = $msg.params.name
      if ($tool -eq "put_document") {
        $name = $msg.params.arguments.name
        $path = $msg.params.arguments.path
        if (-not $name -or -not $path) {
          Write-ToolError $rpcId '{"error":{"code":"bad_request","message":"Missing required field: name, path."}}'
          return
        }
        if (-not (Test-Path -LiteralPath $path)) {
          Write-ToolError $rpcId '{"error":{"code":"bad_request","message":"File not found."}}'
          return
        }
        $markdown = $path -match '\.md$'
        $contentType = if ($markdown) { "text/markdown; charset=utf-8" } else { "text/html; charset=utf-8" }
        $res = Invoke-AuthedCurl @(
          "-X", "PUT",
          "-H", "Content-Type: $contentType",
          "--data-binary", "@$path",
          "$Api/api/documents/$name"
        )
        if ($res.Code -ne "200") {
          Write-ToolError $rpcId $res.Body
          return
        }
        $doc = $res.Body | ConvertFrom-Json
        $dest = $path
        if ($doc.id) {
          New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
          $dest = Join-Path $CacheDir "$($doc.id).html"
          if ($markdown) {
            if (-not $doc.url) {
              Write-ToolError $rpcId '{"error":{"code":"bad_request","message":"Document is missing url."}}'
              return
            }
            $page = [System.IO.Path]::GetTempFileName()
            try {
              $code = & $Curl -sS -o $page -w "%{http_code}" $doc.url
              if ($code -ne "200") {
                $err = Get-Content -Path $page -Raw
                Write-ToolError $rpcId $err
                return
              }
              Move-Item -LiteralPath $page -Destination $dest -Force
              $page = $null
              if ($path -ne $dest -and (Test-Path -LiteralPath $path)) {
                Remove-Item -LiteralPath $path -Force
              }
            } finally {
              if ($page) { Remove-Item -Force $page -ErrorAction SilentlyContinue }
            }
          } elseif ($path -ne $dest -and (Test-Path -LiteralPath $path)) {
            Move-Item -LiteralPath $path -Destination $dest -Force
          }
        }
        $merged = $doc | Select-Object *, @{ Name = "path"; Expression = { $dest } }
        Write-ToolSuccess $rpcId (ConvertTo-Json $merged -Compress)
      } elseif ($tool -eq "get_document") {
        $name = $msg.params.arguments.name
        if (-not $name) {
          Write-ToolError $rpcId '{"error":{"code":"bad_request","message":"Missing required field: name."}}'
          return
        }
        $listFile = [System.IO.Path]::GetTempFileName()
        try {
          $code = & $Curl -sS -o $listFile -w "%{http_code}" "$Api/api/documents"
          $listBody = Get-Content -Path $listFile -Raw
        } finally {
          Remove-Item -Force $listFile -ErrorAction SilentlyContinue
        }
        if ($code -ne "200") {
          Write-ToolError $rpcId $listBody
          return
        }
        $list = $listBody | ConvertFrom-Json
        $doc = @($list.documents) | Where-Object { $_.name -eq $name } | Select-Object -First 1
        if (-not $doc -or -not $doc.id -or -not $doc.url) {
          Write-ToolError $rpcId '{"error":{"code":"not_found","message":"Document not found."}}'
          return
        }
        New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
        $dest = Join-Path $CacheDir "$($doc.id).html"
        if (-not (Test-Path -LiteralPath $dest)) {
          $page = [System.IO.Path]::GetTempFileName()
          try {
            $code = & $Curl -sS -o $page -w "%{http_code}" $doc.url
            if ($code -ne "200") {
              $err = Get-Content -Path $page -Raw
              Write-ToolError $rpcId $err
              return
            }
            Move-Item -LiteralPath $page -Destination $dest -Force
            $page = $null
          } finally {
            if ($page) { Remove-Item -Force $page -ErrorAction SilentlyContinue }
          }
        }
        $merged = $doc | Select-Object *, @{ Name = "path"; Expression = { $dest } }
        Write-ToolSuccess $rpcId (ConvertTo-Json $merged -Compress)
      } else {
        $res = Invoke-AuthedCurl @(
          "-X", "POST",
          "-H", "Content-Type: application/json",
          "-H", "Accept: application/json",
          "--data-binary", $payload,
          "$Api/mcp"
        )
        if ($res.Code -eq "200") {
          Write-Message $res.Body
        } else {
          Write-ToolError $rpcId $res.Body
        }
      }
    }
    default {
      Write-Message (ConvertTo-Json @{ jsonrpc = "2.0"; id = $rpcId; error = @{ code = -32601; message = "Method not found: $($msg.method)." } } -Compress)
    }
  }
}

while ($true) {
  $line = Read-LineBytes
  if ($null -eq $line) { exit 0 }
  if ($line -eq "") { continue }
  Handle-Message $line
}

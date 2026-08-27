$root = 'C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a8c6d7550c32033d2c168f7'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8000/')
$listener.Prefixes.Add('http://192.168.1.103:8000/')
$listener.Start()
Write-Host "Server running at http://localhost:8000/  (also listening on LAN: http://192.168.1.103:8000/)"

$mimeMap = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.woff' = 'font/woff'
  '.woff2' = 'font/woff2'
  '.map'  = 'application/json'
}

while ($listener.IsListening) {
  try {
    $ctx  = $listener.GetContext()
    $url  = $ctx.Request.Url.LocalPath
    $method = $ctx.Request.HttpMethod

    # 允许跨域（方便部署到不同域名时上传共享数据）
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    if ($method -eq 'OPTIONS') {
      $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
      $ctx.Response.Close(); continue
    }

    # POST /upload-shared：接收 JSON 并保存为 shared-data.json
    if ($method -eq 'POST' -and $url -eq '/upload-shared') {
      $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $savePath = Join-Path $root 'shared-data.json'
      [System.IO.File]::WriteAllText($savePath, $body, [System.Text.Encoding]::UTF8)
      $resp = '{"ok":true,"msg":"shared-data.json 已更新"}'
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($resp)
      $ctx.Response.ContentType = 'application/json; charset=utf-8'
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close(); continue
    }

    if ($url -eq '/') { $url = '/index.html' }
    $path = Join-Path $root ($url.TrimStart('/'))

    if (Test-Path $path -PathType Leaf) {
      $ext  = [System.IO.Path]::GetExtension($path).ToLower()
      $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ctx.Response.ContentType        = $mime
      $ctx.Response.ContentLength64    = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $url")
      $ctx.Response.OutputStream.Write($body, 0, $body.Length)
    }
    $ctx.Response.Close()
  } catch {
    Write-Host $_.Exception.Message
  }
}

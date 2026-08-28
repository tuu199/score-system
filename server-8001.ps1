$root = 'C:\Users\Administrator\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\work-mode-projects\6a8c6d7550c32033d2c168f7'
$utf8 = New-Object System.Text.UTF8Encoding $false
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8001/')
$listener.Prefixes.Add('http://192.168.2.196:8001/')
try {
  $listener.Start()
  Write-Host "Server running at http://localhost:8001/  (also listening on LAN: http://192.168.2.196:8001/)"
} catch {
  Write-Host "Failed to start: $($_.Exception.Message)"
  exit 1
}

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
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    if ($method -eq 'OPTIONS') {
      $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
      $ctx.Response.Close(); continue
    }

    # POST /upload-shared - save shared-data.json and auto git push
    if ($method -eq 'POST' -and $url -eq '/upload-shared') {
      $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, $utf8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $savePath = Join-Path $root 'shared-data.json'
      [System.IO.File]::WriteAllText($savePath, $body, $utf8)
      $gitExe = 'C:\Users\Administrator\AppData\Local\GitHubDesktop\app-3.6.4\resources\app\git\mingw64\bin\git.exe'
      try {
        & $gitExe -C $root add shared-data.json 2>$null
        & $gitExe -C $root commit -m "update shared-data.json (auto)" 2>$null
        & $gitExe -C $root push origin main 2>$null
        $resp = '{"ok":true,"msg":"uploaded and pushed to github"}'
      } catch {
        $resp = '{"ok":true,"msg":"uploaded locally, git push skipped"}'
      }
      $bytes = $utf8.GetBytes($resp)
      $ctx.Response.ContentType = 'application/json; charset=utf-8'
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close(); continue
    }

    # GET /sync-latest - pull latest shared-data.json from GitHub Pages
    if ($method -eq 'GET' -and $url -eq '/sync-latest') {
      try {
        $syncUrl = 'https://tuu199.github.io/score-system/shared-data.json'
        $webResp = Invoke-WebRequest -Uri $syncUrl -UseBasicParsing -TimeoutSec 15
        $content = $webResp.Content
        $savePath = Join-Path $root 'shared-data.json'
        [System.IO.File]::WriteAllText($savePath, $content, $utf8)
        $bytes = $utf8.GetBytes($content)
        $ctx.Response.ContentType = 'application/json; charset=utf-8'
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } catch {
        $err = '{"_error":"sync failed, check network"}'
        $bytes = $utf8.GetBytes($err)
        $ctx.Response.StatusCode = 502
        $ctx.Response.ContentType = 'application/json; charset=utf-8'
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      $ctx.Response.Close(); continue
    }

    if ($url -eq '/') { $url = '/index.html' }
    $path = Join-Path $root ($url.TrimStart('/'))
    if (Test-Path $path -PathType Leaf) {
      $ext  = [System.IO.Path]::GetExtension($path).ToLower()
      $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { 'application/octet-stream' }
      if ('.html', '.js', '.css', '.json', '.svg', '.map' -contains $ext) {
        $txt = [System.IO.File]::ReadAllText($path, $utf8)
        $bytes = $utf8.GetBytes($txt)
      } else {
        $bytes = [System.IO.File]::ReadAllBytes($path)
      }
      $ctx.Response.ContentType = $mime
      # 强制不缓存，确保每次加载最新版本
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')
      $ctx.Response.Headers.Add('Pragma', 'no-cache')
      $ctx.Response.Headers.Add('Expires', '0')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $body404 = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $url")
      $ctx.Response.OutputStream.Write($body404, 0, $body404.Length)
    }
    $ctx.Response.Close()
  } catch {
    Write-Host ("Request error: " + $_.Exception.Message)
  }
}

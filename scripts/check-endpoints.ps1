$urls = @(
  'http://localhost:3000/api/dashboard/notes',
  'http://localhost:3000/api/lieferanten',
  'http://localhost:3000/api/settings/effective'
)

foreach ($u in $urls) {
  Write-Output "=== $u ==="
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-Output $r.Content
    Write-Output "HTTP_CODE:$($r.StatusCode)"
  } catch {
    $ex = $_.Exception
    if ($ex.Response) {
      $resp = $ex.Response
      $st = $resp.StatusCode.value__
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $body = $reader.ReadToEnd()
      Write-Output $body
      Write-Output "HTTP_CODE:$st"
    } else {
      Write-Output "REQUEST_FAILED: $($ex.Message)"
    }
  }
  Write-Output ""
}

<#
  Uploads `toktrack daily --json` to R2 (bucket cubityfirst-toktrack, key daily.json),
  where the site's /api/toktrack reads it (src/toktrack.js).

  Uses snapr's "Cloudflare R2" upload destination for credentials: the endpoint and
  access key ID from snapr's config.toml, and the secret key from Windows Credential
  Manager, where snapr keeps it. Nothing secret is stored here or printed.

  Run by the "cubityfirst toktrack upload" scheduled task (see register-toktrack-task.ps1).
  Writes a short log to %LOCALAPPDATA%\cubityfirst\toktrack-upload.log.

  Usage: powershell -NoProfile -ExecutionPolicy Bypass -File upload-toktrack.ps1 [-DryRun]
#>
param(
    [string]$Bucket = 'cubityfirst-toktrack',
    [string]$Key = 'daily.json',
    [string]$SnaprDestination = 'pt5uva7kmher',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$logDir = Join-Path $env:LOCALAPPDATA 'cubityfirst'
$log = Join-Path $logDir 'toktrack-upload.log'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Write-Log([string]$message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $message
    Add-Content -Path $log -Value $line -Encoding utf8
    Write-Output $line
    # Keep the log short
    $lines = Get-Content $log
    if ($lines.Count -gt 500) { $lines | Select-Object -Last 300 | Set-Content $log -Encoding utf8 }
}

# Reads a generic credential's secret from Windows Credential Manager
Add-Type -Namespace CubityFirst -Name Cred -MemberDefinition @'
[DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
private static extern bool CredReadW(string target, int type, int flags, out IntPtr credential);
[DllImport("advapi32.dll")]
private static extern void CredFree(IntPtr buffer);
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
private struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
}
public static string Read(string target) {
    IntPtr p;
    if (!CredReadW(target, 1, 0, out p)) return null;
    try {
        var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
        return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize / 2);
    } finally { CredFree(p); }
}
'@

function Get-Sha256Hex([byte[]]$bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) } finally { $sha.Dispose() }
}

function Get-Hmac([byte[]]$key, [string]$text) {
    $h = New-Object Security.Cryptography.HMACSHA256 (, $key)
    try { $h.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) } finally { $h.Dispose() }
}

try {
    # 1. The export
    $toktrack = (Get-Command toktrack -ErrorAction SilentlyContinue).Source
    if (-not $toktrack) { $toktrack = 'G:\Scripts\toktrack\target\release\toktrack.exe' }
    $json = & $toktrack daily --json 2>$null | Out-String
    if ($LASTEXITCODE -ne 0) { throw "toktrack exited with $LASTEXITCODE" }
    $days = $json | ConvertFrom-Json
    if (-not $days -or $days.Count -lt 1) { throw 'toktrack returned no days' }
    $body = [Text.Encoding]::UTF8.GetBytes($json.Trim())

    # 2. snapr's R2 destination
    $config = Get-Content (Join-Path $env:APPDATA 'snapr\config.toml') -Raw -Encoding UTF8
    $block = ($config -split '\[\[uploads\]\]') | Where-Object { $_ -match "(?m)^id\s*=\s*`"$SnaprDestination`"" } | Select-Object -First 1
    if (-not $block) { throw "snapr destination $SnaprDestination not found in config.toml" }
    $endpoint = [regex]::Match($block, '(?m)^endpoint\s*=\s*"([^"]+)"').Groups[1].Value.TrimEnd('/')
    $accessKey = [regex]::Match($block, '(?m)^access_key_id\s*=\s*"([^"]+)"').Groups[1].Value
    $secret = [CubityFirst.Cred]::Read("upload-s3-$SnaprDestination.snapr")
    if (-not $endpoint -or -not $accessKey) { throw 'endpoint or access key missing from snapr config' }
    if (-not $secret) { throw 'snapr secret key not found in Credential Manager' }

    if ($DryRun) {
        Write-Log ("dry run: {0} days ({1:N0} bytes) would go to {2}/{3}" -f $days.Count, $body.Length, $Bucket, $Key)
        exit 0
    }

    # 3. Signed PUT (AWS Signature Version 4, which R2 speaks)
    $hostName = ([Uri]$endpoint).Host
    $now = [DateTime]::UtcNow
    $amzDate = $now.ToString('yyyyMMddTHHmmssZ')
    $day = $now.ToString('yyyyMMdd')
    $scope = "$day/auto/s3/aws4_request"
    $payloadHash = Get-Sha256Hex $body
    $path = "/$Bucket/$Key"
    $contentType = 'application/json'

    $signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'
    $canonical = "PUT`n$path`n`ncontent-type:$contentType`nhost:$hostName`nx-amz-content-sha256:$payloadHash`nx-amz-date:$amzDate`n`n$signedHeaders`n$payloadHash"
    $toSign = "AWS4-HMAC-SHA256`n$amzDate`n$scope`n" + (Get-Sha256Hex ([Text.Encoding]::UTF8.GetBytes($canonical)))

    $k = Get-Hmac ([Text.Encoding]::UTF8.GetBytes("AWS4$secret")) $day
    $k = Get-Hmac $k 'auto'
    $k = Get-Hmac $k 's3'
    $k = Get-Hmac $k 'aws4_request'
    $signature = -join ((Get-Hmac $k $toSign) | ForEach-Object { $_.ToString('x2') })

    $headers = @{
        'x-amz-date'           = $amzDate
        'x-amz-content-sha256' = $payloadHash
        'Authorization'        = "AWS4-HMAC-SHA256 Credential=$accessKey/$scope, SignedHeaders=$signedHeaders, Signature=$signature"
    }
    Invoke-WebRequest -Uri "$endpoint$path" -Method Put -Headers $headers -ContentType $contentType -Body $body -UseBasicParsing | Out-Null

    Write-Log ("uploaded {0} days ({1:N0} bytes), latest {2}" -f $days.Count, $body.Length, ($days | ForEach-Object date | Sort-Object | Select-Object -Last 1))
} catch {
    Write-Log "failed: $($_.Exception.Message)"
    exit 1
}

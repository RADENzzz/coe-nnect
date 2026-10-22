<#
.SYNOPSIS
    Regenerate the public-schema SQL snapshot in docs/DATABASE STRUCTURE.

.DESCRIPTION
    Dumps the live Supabase/PostgreSQL public schema with pg_dump and writes
    it to docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql in the
    repository's established format:

      - schema only (no row data)
      - --no-owner, grants preserved
      - the CoE-NNECT header block
      - the custom on_auth_user_created trigger on auth.users appended at the end
        (a public-only pg_dump does not include it)

    The connection is read from DATABASE_URL in apps/backend/.env.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/dump-database-schema.ps1
#>
[CmdletBinding()]
param(
    [string] $EnvFile = "apps/backend/.env",
    [string] $OutputPath = "docs/DATABASE STRUCTURE/coe-nnect-database-structure.sql",
    [string] $PgDump = "pg_dump"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot $EnvFile
$outPath = Join-Path $repoRoot $OutputPath

if (-not (Test-Path $envPath)) {
    throw "Env file not found: $envPath"
}

# --- read DATABASE_URL from the env file ------------------------------------
$databaseUrl = (Get-Content $envPath -Encoding UTF8 |
    Where-Object { $_ -match '^\s*DATABASE_URL=' } |
    Select-Object -First 1) -replace '^\s*DATABASE_URL\s*=\s*', ''

if (-not $databaseUrl) {
    throw "DATABASE_URL not found in $envPath"
}

$uri = [System.Uri] $databaseUrl
$userInfo = $uri.UserInfo -split ':', 2
$dbUser = if ($userInfo[0]) { [System.Uri]::UnescapeDataString($userInfo[0]) } else { "postgres" }
$dbPassword = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$dbName = $uri.AbsolutePath.TrimStart('/')

# --- run pg_dump -------------------------------------------------------------
$tmpDump = Join-Path ([System.IO.Path]::GetTempPath()) ("coe-nnect-schema-" + [System.Guid]::NewGuid().ToString("N") + ".sql")

Write-Host "Dumping public schema of $dbName at $dbHost`:$dbPort ..."
$env:PGPASSWORD = $dbPassword
try {
    & $PgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName `
        --schema=public --schema-only --no-owner --file $tmpDump
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# --- normalize the dump into the repository format --------------------------
$dump = [System.IO.File]::ReadAllText($tmpDump, [System.Text.Encoding]::UTF8)
Remove-Item $tmpDump -ErrorAction SilentlyContinue

$lines = $dump -split "`r?`n"

$kept = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
    # psql meta-commands from the PostgreSQL 17.6+/18 pg_dump hardening:
    # they are not portable, and the previous snapshot did not carry them.
    if ($line -match '^\\(un)?restrict ') { continue }
    # SET transaction_timeout requires PostgreSQL 17+; the snapshot is also
    # applied to PostgreSQL 15 projects, so drop it.
    if ($line -eq 'SET transaction_timeout = 0;') { continue }
    if ($line -eq 'CREATE SCHEMA public;') {
        $kept.Add('CREATE SCHEMA IF NOT EXISTS public;')
        continue
    }
    $kept.Add($line)
}

$body = ($kept -join "`n").TrimEnd("`n")

$generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$dateLabel = (Get-Date).ToUniversalTime().ToString("d MMMM yyyy")

$header = @(
    "-- CoE-NNECT database schema"
    "-- Generated: $generatedAt"
    "--"
    "-- This file contains the public schema only (tables, types, functions,"
    "-- triggers, RLS policies, indexes, and grants). It does not contain row data."
    "-- Apply it to an empty Supabase project. The custom trigger on auth.users is"
    "-- appended at the end because pg_dump does not include it in a public-only dump."
    ""
    ""
) -join "`n"

$trailer = @(
    ""
    ""
    "-- Custom trigger on Supabase's auth.users table."
    "-- Keep this in sync with public.handle_new_auth_user()."
    "DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;"
    "CREATE TRIGGER on_auth_user_created"
    "  AFTER INSERT ON auth.users"
    "  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();"
    ""
) -join "`n"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outPath, $header + $body + "`n" + $trailer, $utf8NoBom)

Write-Host "Wrote $OutputPath (snapshot date: $dateLabel)"

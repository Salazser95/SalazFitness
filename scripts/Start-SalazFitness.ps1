<#
.SYNOPSIS
    Arranca SalazFitness: backend de wger y frontend PWA.

.DESCRIPTION
    Levanta los dos procesos en ventanas separadas, comprueba que responden
    y muestra las URLs, incluida la de la red local para usarlo desde el movil.

    No instala nada. Si falta algo, lo dice y para.

.PARAMETER ConModuloCompra
    Arranca el backend con el modulo salaz (compra y coste) cargado por
    PYTHONPATH. Sin este parametro arranca wger tal cual.

.PARAMETER SoloBackend
    Arranca solo el servidor de Django.

.PARAMETER Puerto
    Puerto del backend. Por defecto 8000.

.EXAMPLE
    .\Start-SalazFitness.ps1

.EXAMPLE
    .\Start-SalazFitness.ps1 -ConModuloCompra
#>
[CmdletBinding()]
param(
    [string] $RutaWger    = "C:\Proyectos\wger",
    [string] $RutaSalaz   = "C:\Proyectos\SalazFitness",
    [int]    $Puerto      = 8000,
    [switch] $ConModuloCompra,
    [switch] $SoloBackend
)

$ErrorActionPreference = "Stop"

function Paso($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "    OK    $t" -ForegroundColor Green }
function Mal($t)  { Write-Host "    ERROR $t" -ForegroundColor Red }
function Nota($t) { Write-Host "    $t" -ForegroundColor DarkGray }

# ------------------------------------------------------------ comprobaciones

Paso "Comprobando la instalacion"

$python = Join-Path $RutaWger ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Mal "No existe $python"
    Nota "Instala el backend primero. Ver README.md, seccion 'Puesta en marcha'."
    exit 1
}
Ok "Entorno de Python"

$db = Join-Path $RutaWger "db\database.sqlite"
if (-not (Test-Path $db)) {
    Mal "No existe la base de datos en $db"
    Nota "Ejecuta: .\.venv\Scripts\wger.exe bootstrap"
    exit 1
}
Ok ("Base de datos " + [math]::Round((Get-Item $db).Length / 1MB) + " MB")

$claves = Join-Path $RutaWger "settings\local_dev_extra.py"
if (-not (Test-Path $claves)) {
    Mal "Faltan las claves JWT en settings\local_dev_extra.py"
    Nota "Sin ellas el login de la API devuelve 500. Ver docs/ARQUITECTURA.md."
    exit 1
}
Ok "Claves JWT configuradas"

if (-not $SoloBackend) {
    $modulos = Join-Path $RutaSalaz "web\node_modules"
    if (-not (Test-Path $modulos)) {
        Mal "Faltan las dependencias del frontend"
        Nota "Ejecuta: cd $RutaSalaz\web ; npm install"
        exit 1
    }
    Ok "Dependencias del frontend"
}

# -------------------------------------------------------- puertos ocupados

foreach ($p in @($Puerto, 5173)) {
    if ($SoloBackend -and $p -eq 5173) { continue }
    $uso = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($uso) {
        Mal "El puerto $p ya esta ocupado por el proceso $($uso.OwningProcess)"
        Nota "Cierralo o usa otro puerto con -Puerto"
        exit 1
    }
}

# ------------------------------------------------------------ arranque

Paso "Arrancando el backend en el puerto $Puerto"

$envBackend = "`$env:DJANGO_SETTINGS_MODULE = 'settings.local_dev'"
if ($ConModuloCompra) {
    $envBackend = "`$env:PYTHONPATH = '$RutaSalaz\backend'; `$env:DJANGO_SETTINGS_MODULE = 'salaz_settings'"
    Nota "Con el modulo de compra y coste"
}

$cmdBackend = "Set-Location '$RutaWger'; $envBackend; .\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:$Puerto"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmdBackend

# Esperar a que responda, en vez de dormir a ciegas
$listo = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Puerto/api/v2/" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $listo = $true; break }
    } catch { }
}
if ($listo) { Ok "Backend respondiendo" } else { Mal "El backend no responde tras 30 segundos"; exit 1 }

if (-not $SoloBackend) {
    Paso "Arrancando el frontend"
    $cmdFront = "Set-Location '$RutaSalaz\web'; npm run dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmdFront

    $listoFront = $false
    foreach ($i in 1..30) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { $listoFront = $true; break }
        } catch { }
    }
    if ($listoFront) { Ok "Frontend respondiendo" } else { Mal "El frontend no responde"; exit 1 }
}

# ------------------------------------------------------------- resumen

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
       Select-Object -First 1).IPAddress

Paso "SalazFitness en marcha"
Write-Host ""
if (-not $SoloBackend) {
    Write-Host "  App          http://localhost:5173" -ForegroundColor White
    Write-Host "  Desde movil  http://${ip}:5173" -ForegroundColor White
}
Write-Host "  API          http://localhost:$Puerto/api/v2/"
Write-Host "  wger web     http://localhost:$Puerto"
Write-Host ""
Write-Host "  Usuario      admin"
Write-Host "  Clave        adminadmin"
Write-Host ""
Nota "Para instalarlo en el movil: abre la URL de red y usa 'Anadir a pantalla de inicio'."
Nota "Si el movil no llega, abre el puerto una vez como administrador:"
Nota "  New-NetFirewallRule -DisplayName 'SalazFitness' -Direction Inbound -Protocol TCP -LocalPort 5173,$Puerto -Action Allow -Profile Private"
Write-Host ""

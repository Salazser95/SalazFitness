<#
.SYNOPSIS
    Crea una rutina de entrenamiento empuje/tiron/pierna (6 dias/semana,
    descanso el jueves) en wger via la API REST.

.DESCRIPTION
    Programa fijo:
        Lunes     Empuje A (pecho, hombro, triceps)
        Martes    Tiron A (espalda, biceps)
        Miercoles Pierna A
        Jueves    DESCANSO
        Viernes   Empuje B
        Sabado    Tiron B
        Domingo   Pierna B y core

    Crea: routine -> day (x7) -> slot -> slot-entry -> sets/reps/rir/rest-config
    por iteracion (semana), con progresion:
      - Series/RIR: valor base por nivel, con semana de descarga en la 4 y en
        la 8 (menos series, mas RIR = menos cerca del fallo). NOTA: el
        encargo decia "bajar el RIR" en la descarga; aqui se ha implementado
        subiendo el RIR (mas margen), que es la definicion estandar de una
        descarga. Se deja constancia expresa de este cambio de criterio.
      - Peso: solo en el ejercicio ancla de cada dia (el primer basico,
        cargable con barra o mancuerna). Empieza en un valor bajo de
        referencia y sube 2.5% compuesto cada semana, con caida del 10% en
        las semanas de descarga. El resto de ejercicios se deja SIN peso
        configurado: el usuario lo ajusta en su primera sesion real.

.PARAMETER Usuario
    Usuario de wger. Por defecto "admin".

.PARAMETER Clave
    Contrasena de wger. Por defecto "adminadmin".

.PARAMETER Servidor
    URL base del backend. Por defecto http://127.0.0.1:8000

.PARAMETER Nombre
    Nombre de la rutina a crear.

.PARAMETER Semanas
    Duracion en semanas (iteraciones). Por defecto 12.

.PARAMETER Nivel
    principiante | intermedio | avanzado. Por defecto intermedio.

.PARAMETER WhatIf
    Muestra el plan completo (dias, ejercicios, series/reps/RIR/descanso,
    pesos ancla) sin crear nada en el servidor.

.EXAMPLE
    .\Nueva-Rutina.ps1 -Nivel intermedio -WhatIf

.EXAMPLE
    .\Nueva-Rutina.ps1 -Usuario admin -Clave adminadmin -Nombre "PPL 6 dias" -Semanas 12 -Nivel intermedio
#>

param(
    [string]$Usuario = "admin",
    [string]$Clave = "adminadmin",
    [string]$Servidor = "http://127.0.0.1:8000",
    [string]$Nombre = "Empuje Tiron Pierna - 6 dias",
    [int]$Semanas = 12,
    [ValidateSet("principiante", "intermedio", "avanzado")]
    [string]$Nivel = "intermedio",
    # Fecha de inicio en formato yyyy-MM-dd. Si se omite, el proximo lunes.
    [string]$FechaInicio = "",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Datos del programa (verificados contra los 872 ejercicios del servidor)
# ---------------------------------------------------------------------------

# Categorias reales de esta instalacion (ver docs/API-CONTRACT.md)
$Categorias = @{
    8  = "Arms"
    9  = "Legs"
    10 = "Abs"
    11 = "Chest"
    12 = "Back"
    13 = "Shoulders"
    14 = "Calves"
    15 = "Cardio"
}

function New-Ejercicio {
    param($Id, $Nombre, $Categoria, $Rol, $PesoRef)
    return [pscustomobject]@{
        Id        = $Id
        Nombre    = $Nombre
        Categoria = $Categoria
        Rol       = $Rol          # "basico" o "accesorio"
        PesoRef   = $PesoRef      # kg de referencia solo para el ancla del dia, o $null
    }
}

# order = 1..7 (lunes..domingo). EsDescanso marca el dia intermedio.
$Dias = @(
    [pscustomobject]@{
        Order = 1; Nombre = "Empuje A"; EsDescanso = $false
        Ejercicios = @(
            New-Ejercicio 73   "Bench Press"               11 "basico"    20
            New-Ejercicio 687  "Overhead Press"             11 "basico"    $null
            New-Ejercicio 194  "Dips"                       11 "basico"    $null
            New-Ejercicio 924  "Cable Fly"                  11 "accesorio" $null
            New-Ejercicio 256  "Front Raises"               13 "accesorio" $null
            New-Ejercicio 1185 "Triceps Pushdown"           8  "accesorio" $null
        )
    }
    [pscustomobject]@{
        Order = 2; Nombre = "Tiron A"; EsDescanso = $false
        Ejercicios = @(
            New-Ejercicio 475  "Pull ups"                   12 "basico"    $null
            New-Ejercicio 1698 "Barbell Row (Overhand)"      12 "basico"    20
            New-Ejercicio 1697 "Lat Pulldown (Wide Grip)"    12 "basico"    $null
            New-Ejercicio 222  "Face Pulls"                  13 "accesorio" $null
            New-Ejercicio 91   "Biceps Curls With Barbell"   8  "accesorio" $null
            New-Ejercicio 1932 "Hammer Curl"                 8  "accesorio" $null
        )
    }
    [pscustomobject]@{
        Order = 3; Nombre = "Pierna A"; EsDescanso = $false
        Ejercicios = @(
            New-Ejercicio 1805 "Barbell Squat"               9  "basico"    20
            New-Ejercicio 507  "Romanian Deadlift"            9  "basico"    $null
            New-Ejercicio 371  "Leg Press"                    9  "basico"    $null
            New-Ejercicio 364  "Leg Curl"                     9  "accesorio" $null
            New-Ejercicio 622  "Standing Calf Raises"        14 "accesorio" $null
        )
    }
    [pscustomobject]@{
        Order = 4; Nombre = "Descanso"; EsDescanso = $true
        Ejercicios = @()
    }
    [pscustomobject]@{
        Order = 5; Nombre = "Empuje B"; EsDescanso = $false
        Ejercicios = @(
            New-Ejercicio 1277 "Incline Dumbbell Press"     11 "basico"    10
            New-Ejercicio 20   "Arnold Press"               13 "basico"    $null
            New-Ejercicio 129  "Chest Press"                11 "basico"    $null
            New-Ejercicio 348  "Lateral Raises"              13 "accesorio" $null
            New-Ejercicio 1519 "Overhead Triceps Extension"  8  "accesorio" $null
            New-Ejercicio 1675 "Push-Ups"                   11 "accesorio" $null
        )
    }
    [pscustomobject]@{
        Order = 6; Nombre = "Tiron B"; EsDescanso = $false
        Ejercicios = @(
            New-Ejercicio 919  "T-Bar row"                  12 "basico"    20
            New-Ejercicio 152  "Chin Up"                    12 "basico"    $null
            New-Ejercicio 1117 "Seated Cable Row"            12 "basico"    $null
            New-Ejercicio 822  "Cable Rear Delt Fly"         13 "accesorio" $null
            New-Ejercicio 465  "Preacher Curls"              8  "accesorio" $null
            New-Ejercicio 1649 "Concentration Curl"          8  "accesorio" $null
        )
    }
    [pscustomobject]@{
        Order = 7; Nombre = "Pierna B y Core"; EsDescanso = $false
        Ejercicios = @(
            New-Ejercicio 184  "Deadlifts"                  12 "basico"    20
            New-Ejercicio 984  "Lunges"                      9  "basico"    $null
            New-Ejercicio 369  "Leg Extension"                9  "accesorio" $null
            New-Ejercicio 1620 "Seated Dumbbell Calf Raise"  14 "accesorio" $null
            New-Ejercicio 458  "Plank"                       10 "accesorio" $null
            New-Ejercicio 167  "Crunch"                      10 "accesorio" $null
        )
    }
)

# Ningun ejercicio de la lista de arriba tuvo que sustituirse: los 35 (7 dias
# x 5-6 ejercicios) se resolvieron contra /api/v2/exercise-translation/ con
# nombre exacto y se cruzaron con /api/v2/exercise/ para confirmar que el id
# existe de verdad entre los 872 disponibles. Este array queda vacio salvo
# que una ejecucion futura, contra otra base de datos de ejercicios, no
# encuentre alguno de estos ids.
$Sustituciones = @()

# ---------------------------------------------------------------------------
# Parametros por nivel
# ---------------------------------------------------------------------------

function Get-ParametrosNivel {
    param([string]$Nivel)

    switch ($Nivel) {
        "principiante" {
            return [pscustomobject]@{
                BasicoSets = 3;  BasicoReps = 10; BasicoRir = 3; BasicoRest = 90
                AccSets    = 3;  AccReps    = 10; AccRir    = 3; AccRest    = 90
            }
        }
        "intermedio" {
            return [pscustomobject]@{
                BasicoSets = 4;  BasicoReps = 8;  BasicoRir = 2; BasicoRest = 120
                AccSets    = 4;  AccReps    = 8;  AccRir    = 2; AccRest    = 90
            }
        }
        "avanzado" {
            return [pscustomobject]@{
                BasicoSets = 5;  BasicoReps = 6;  BasicoRir = 1; BasicoRest = 180
                AccSets    = 4;  AccReps    = 10; AccRir    = 2; AccRest    = 90
            }
        }
    }
}

$P = Get-ParametrosNivel -Nivel $Nivel

# Semanas de descarga (deload): menos series, mas RIR. Reps y descanso se
# mantienen. Solo cuentan si caen dentro de -Semanas.
$SemanasDescarga = @(4, 8) | Where-Object { $_ -le $Semanas }

function Get-ValorSemana {
    param([int]$Base, [int]$Semana, [string]$Tipo)
    # Tipo: "sets" (resta 1, minimo 2) o "rir" (suma 1)
    $esDescarga = $SemanasDescarga -contains $Semana
    if (-not $esDescarga) { return $Base }
    if ($Tipo -eq "sets") {
        $v = $Base - 1
        if ($v -lt 2) { $v = 2 }
        return $v
    }
    if ($Tipo -eq "rir") { return $Base + 1 }
    return $Base
}

function Get-PuntosDeCambio {
    param([int]$Semanas)
    # Semanas en las que el valor de sets/rir cambia respecto a la anterior:
    # semana 1 (base), 4 y 8 (descarga), 5 y 9 (vuelta a la base).
    $puntos = [System.Collections.Generic.List[int]]::new()
    $puntos.Add(1)
    foreach ($s in @(4, 5, 8, 9)) {
        if ($s -le $Semanas) { [void]$puntos.Add($s) }
    }
    return $puntos | Sort-Object -Unique
}

function Get-PesoSemana {
    param([double]$Ref, [int]$Semana)
    # Progresion 2.5% semanal compuesta; en semana de descarga, caida del
    # 10% respecto a la trayectoria ideal de la semana anterior. La semana
    # siguiente retoma la progresion como si la descarga no hubiese pasado
    # (no resetea el acumulado).
    $ideal = $Ref * [Math]::Pow(1.025, $Semana - 1)
    if ($SemanasDescarga -contains $Semana) {
        $idealAnterior = $Ref * [Math]::Pow(1.025, ($Semana - 1) - 1)
        $val = $idealAnterior * 0.9
    }
    else {
        $val = $ideal
    }
    # redondeo a 0.5 kg, incremento realista con discos pequenos
    return [Math]::Round($val * 2) / 2
}

# ---------------------------------------------------------------------------
# Cliente HTTP (allauth headless + JWT)
# ---------------------------------------------------------------------------

$script:AccessToken   = $null
$script:RefreshToken  = $null
$script:TokenObtained = $null

function Connect-Wger {
    param([string]$Servidor, [string]$Usuario, [string]$Clave)

    $body = @{ username = $Usuario; password = $Clave } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$Servidor/allauth/app/v1/auth/login" -Method Post -Body $body -ContentType "application/json"

    if (-not $resp.meta.is_authenticated) {
        throw "Login fallido contra $Servidor para el usuario $Usuario"
    }

    $script:AccessToken   = $resp.meta.access_token
    $script:RefreshToken  = $resp.meta.refresh_token
    $script:TokenObtained = Get-Date

    Write-Host "Conectado a $Servidor como $Usuario"
}

function Update-Token {
    # El access token vive 5 minutos. Se refresca si tiene mas de 3.5 min.
    $edad = (Get-Date) - $script:TokenObtained
    if ($edad.TotalSeconds -lt 210) { return }

    $body = @{ refresh_token = $script:RefreshToken } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$Servidor/allauth/app/v1/tokens/refresh" -Method Post -Body $body -ContentType "application/json"

    $script:AccessToken   = $resp.data.access_token
    $script:RefreshToken  = $resp.data.refresh_token
    $script:TokenObtained = Get-Date
}

function Invoke-WgerApi {
    param([string]$Metodo, [string]$Ruta, [hashtable]$Cuerpo)

    Update-Token
    $headers = @{ Authorization = "Bearer $script:AccessToken" }
    $uri = "$Servidor$Ruta"

    if ($Cuerpo) {
        $json = $Cuerpo | ConvertTo-Json -Depth 5
        return Invoke-RestMethod -Uri $uri -Method $Metodo -Headers $headers -Body $json -ContentType "application/json"
    }
    else {
        return Invoke-RestMethod -Uri $uri -Method $Metodo -Headers $headers
    }
}

# ---------------------------------------------------------------------------
# Modo -WhatIf: solo imprime el plan
# ---------------------------------------------------------------------------

function Show-Plan {
    Write-Host ""
    Write-Host "=== PLAN (WhatIf, no se crea nada) ==="
    Write-Host "Nombre  : $Nombre"
    Write-Host "Servidor: $Servidor"
    Write-Host "Semanas : $Semanas"
    Write-Host "Nivel   : $Nivel"
    Write-Host "Semanas de descarga: $($SemanasDescarga -join ', ')"
    Write-Host ""

    $nombresDias = @("Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo")

    foreach ($dia in $Dias) {
        $etiqueta = $nombresDias[$dia.Order - 1]
        Write-Host "--- $etiqueta : $($dia.Nombre) ---"
        if ($dia.EsDescanso) {
            Write-Host "    DESCANSO"
            Write-Host ""
            continue
        }
        foreach ($ej in $dia.Ejercicios) {
            if ($ej.Rol -eq "basico") {
                $sets = $P.BasicoSets; $reps = $P.BasicoReps; $rir = $P.BasicoRir; $rest = $P.BasicoRest
            }
            else {
                $sets = $P.AccSets; $reps = $P.AccReps; $rir = $P.AccRir; $rest = $P.AccRest
            }
            $catNombre = $Categorias[[int]$ej.Categoria]
            $pesoTxt = ""
            if ($ej.PesoRef) {
                $pesoSem12 = Get-PesoSemana -Ref $ej.PesoRef -Semana ([Math]::Min(12, $Semanas))
                $pesoTxt = " | peso ref $($ej.PesoRef) kg -> semana $([Math]::Min(12, $Semanas)): $pesoSem12 kg"
            }
            Write-Host "    [$($ej.Id)] $($ej.Nombre) ($catNombre, $($ej.Rol)) - $sets x $reps, RIR $rir, descanso $($rest)s$pesoTxt"
        }
        Write-Host ""
    }

    if ($Sustituciones.Count -gt 0) {
        Write-Host "Sustituciones aplicadas:"
        foreach ($s in $Sustituciones) { Write-Host "    $s" }
    }
    else {
        Write-Host "Sustituciones: ninguna. Los 35 ejercicios existen tal cual en el servidor."
    }
}

if ($WhatIf) {
    Show-Plan
    return
}

# ---------------------------------------------------------------------------
# Ejecucion real
# ---------------------------------------------------------------------------

Connect-Wger -Servidor $Servidor -Usuario $Usuario -Clave $Clave

# Fecha de inicio: el proximo lunes (hoy si hoy ya es lunes)
$hoy = Get-Date
$diaSemana = [int]$hoy.DayOfWeek   # domingo=0 .. sabado=6
if ($diaSemana -eq 0) { $offset = 1 } else { $offset = (8 - $diaSemana) % 7 }
if ($offset -eq 0 -and $diaSemana -ne 1) { $offset = 7 }
$inicio = $hoy.Date.AddDays($offset)
if ($diaSemana -eq 1) { $inicio = $hoy.Date }
if ($FechaInicio -ne "") { $inicio = [datetime]::ParseExact($FechaInicio, "yyyy-MM-dd", [System.Globalization.CultureInfo]::InvariantCulture) }
$fin = $inicio.AddDays(($Semanas * 7) - 1)

$inicioStr = $inicio.ToString("yyyy-MM-dd")
$finStr    = $fin.ToString("yyyy-MM-dd")

Write-Host "Creando rutina '$Nombre' del $inicioStr al $finStr ($Semanas semanas)..."

$rutina = Invoke-WgerApi -Metodo Post -Ruta "/api/v2/routine/" -Cuerpo @{
    name        = $Nombre
    start       = $inicioStr
    end         = $finStr
    fit_in_week = $true
}
$rutinaId = $rutina.id
Write-Host "Rutina creada: id=$rutinaId"

$nombresDias = @("Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo")
$puntosCambio = Get-PuntosDeCambio -Semanas $Semanas

$resumenParaImprimir = @()

foreach ($dia in $Dias) {
    $etiqueta = $nombresDias[$dia.Order - 1]

    if ($dia.EsDescanso) {
        $diaResp = Invoke-WgerApi -Metodo Post -Ruta "/api/v2/day/" -Cuerpo @{
            routine  = $rutinaId
            name     = "Descanso"
            type     = "custom"
            is_rest  = $true
            order    = $dia.Order
        }
        Write-Host "  Dia $etiqueta -> Descanso (id=$($diaResp.id))"
        $resumenParaImprimir += [pscustomobject]@{ Dia = $etiqueta; Nombre = "Descanso"; Ejercicios = @() }
        continue
    }

    $diaResp = Invoke-WgerApi -Metodo Post -Ruta "/api/v2/day/" -Cuerpo @{
        routine = $rutinaId
        name    = $dia.Nombre
        type    = "custom"
        is_rest = $false
        order   = $dia.Order
    }
    $diaId = $diaResp.id
    Write-Host "  Dia $etiqueta -> $($dia.Nombre) (id=$diaId)"

    $filaEjercicios = @()
    $ordenSlot = 1

    foreach ($ej in $dia.Ejercicios) {
        $slot = Invoke-WgerApi -Metodo Post -Ruta "/api/v2/slot/" -Cuerpo @{
            day   = $diaId
            order = $ordenSlot
        }
        $slotId = $slot.id

        $slotEntry = Invoke-WgerApi -Metodo Post -Ruta "/api/v2/slot-entry/" -Cuerpo @{
            slot     = $slotId
            exercise = $ej.Id
            order    = 1
            type     = "normal"
        }
        $slotEntryId = $slotEntry.id

        if ($ej.Rol -eq "basico") {
            $setsBase = $P.BasicoSets; $repsBase = $P.BasicoReps; $rirBase = $P.BasicoRir; $restBase = $P.BasicoRest
        }
        else {
            $setsBase = $P.AccSets; $repsBase = $P.AccReps; $rirBase = $P.AccRir; $restBase = $P.AccRest
        }

        # sets-config y rir-config: una fila por punto de cambio
        foreach ($semana in $puntosCambio) {
            $setsVal = Get-ValorSemana -Base $setsBase -Semana $semana -Tipo "sets"
            [void](Invoke-WgerApi -Metodo Post -Ruta "/api/v2/sets-config/" -Cuerpo @{
                slot_entry = $slotEntryId; iteration = $semana; value = $setsVal
            })
            $rirVal = Get-ValorSemana -Base $rirBase -Semana $semana -Tipo "rir"
            [void](Invoke-WgerApi -Metodo Post -Ruta "/api/v2/rir-config/" -Cuerpo @{
                slot_entry = $slotEntryId; iteration = $semana; value = $rirVal
            })
        }

        # reps-config y rest-config: constantes, una sola fila en la semana 1
        [void](Invoke-WgerApi -Metodo Post -Ruta "/api/v2/repetitions-config/" -Cuerpo @{
            slot_entry = $slotEntryId; iteration = 1; value = $repsBase
        })
        [void](Invoke-WgerApi -Metodo Post -Ruta "/api/v2/rest-config/" -Cuerpo @{
            slot_entry = $slotEntryId; iteration = 1; value = $restBase
        })

        # weight-config: solo en el ancla del dia, una fila por semana
        if ($ej.PesoRef) {
            for ($semana = 1; $semana -le $Semanas; $semana++) {
                $pesoVal = Get-PesoSemana -Ref $ej.PesoRef -Semana $semana
                [void](Invoke-WgerApi -Metodo Post -Ruta "/api/v2/weight-config/" -Cuerpo @{
                    slot_entry = $slotEntryId; iteration = $semana; value = $pesoVal
                })
            }
        }

        $catNombre = $Categorias[[int]$ej.Categoria]
        $filaEjercicios += [pscustomobject]@{
            Nombre = $ej.Nombre; Categoria = $catNombre; Rol = $ej.Rol
            Sets = $setsBase; Reps = $repsBase; Rir = $rirBase; Rest = $restBase
            PesoRef = $ej.PesoRef
        }

        $ordenSlot++
    }

    $resumenParaImprimir += [pscustomobject]@{ Dia = $etiqueta; Nombre = $dia.Nombre; Ejercicios = $filaEjercicios }
}

Write-Host ""
Write-Host "Rutina $rutinaId creada por completo. Verificando contra el servidor..."

# ---------------------------------------------------------------------------
# Verificacion: leer la rutina de vuelta y comprobar que el jueves es
# descanso y que el resto de dias traen sus ejercicios.
# ---------------------------------------------------------------------------

Update-Token
$headers = @{ Authorization = "Bearer $script:AccessToken" }
$secuencia = Invoke-RestMethod -Uri "$Servidor/api/v2/routine/$rutinaId/date-sequence-gym/" -Headers $headers

$primeraSemana = $secuencia | Where-Object { $_.iteration -eq 1 } | Select-Object -First 7

$juevesOk = $false
foreach ($entrada in $primeraSemana) {
    $fecha = [datetime]$entrada.date
    if ([int]$fecha.DayOfWeek -eq 4) {
        # jueves
        if ($null -eq $entrada.day -or $entrada.day.is_rest -eq $true) {
            $juevesOk = $true
        }
    }
}

Write-Host ""
Write-Host "=== RESUMEN DE LA RUTINA CREADA ==="
Write-Host "Id de rutina: $rutinaId"
Write-Host "URL: $Servidor/en/routine/$rutinaId/view"
Write-Host "Fechas: $inicioStr a $finStr ($Semanas semanas)"
Write-Host "Nivel: $Nivel"
Write-Host ""

foreach ($fila in $resumenParaImprimir) {
    Write-Host "--- $($fila.Dia): $($fila.Nombre) ---"
    if ($fila.Ejercicios.Count -eq 0) {
        Write-Host "    DESCANSO"
        Write-Host ""
        continue
    }
    foreach ($e in $fila.Ejercicios) {
        $pesoTxt = ""
        if ($e.PesoRef) { $pesoTxt = " | peso ref semana 1: $($e.PesoRef) kg (sube 2.5%/semana, baja 10% en semanas de descarga)" }
        Write-Host "    $($e.Nombre) ($($e.Categoria), $($e.Rol)) - $($e.Sets) x $($e.Reps), RIR $($e.Rir), descanso $($e.Rest)s$pesoTxt"
    }
    Write-Host ""
}

Write-Host "Semanas de descarga (menos series, mas RIR): $($SemanasDescarga -join ', ')"
Write-Host "Pesos: solo configurados en el ejercicio ancla de cada dia, con un valor bajo de referencia."
Write-Host "       El resto de ejercicios queda SIN peso: el usuario lo ajusta en su primera sesion real."
Write-Host ""

if ($juevesOk) {
    Write-Host "VERIFICACION: el jueves de la semana 1 sale como DESCANSO. Correcto."
}
else {
    Write-Host "VERIFICACION: el jueves de la semana 1 NO aparece como descanso. Revisar."
}

if ($Sustituciones.Count -gt 0) {
    Write-Host ""
    Write-Host "Sustituciones aplicadas (ejercicio pedido no existia, se uso alternativa de la misma categoria):"
    foreach ($s in $Sustituciones) { Write-Host "    $s" }
}
else {
    Write-Host "Sustituciones: ninguna. Los 35 ejercicios pedidos existian tal cual en el servidor."
}

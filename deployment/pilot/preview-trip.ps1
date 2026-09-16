#Requires -Version 5.1
param(
    [string]$Subnet = '192.168.8.0/24',
    [string]$VpnSubnet = '10.0.0.0/24',
    [ValidateNotNullOrEmpty()][string]$Distro = 'Ubuntu-22.04',
    [ValidateNotNullOrEmpty()][string]$RepoPath = '/home/jesusotero/coding/tour-guide-app',
    [switch]$CheckOnly,
    [switch]$NoKeepAwake
)
$ErrorActionPreference = 'Stop'
$awake = $false

function Quote-PS([string]$Value) { "'" + $Value.Replace("'", "''") + "'" }
function Quote-Native([string]$Value) {
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = $Value -replace '(\\*)"', '$1$1\"'
    '"' + ($escaped -replace '(\\+)$', '$1$1') + '"'
}

try {
    $wsl = (Get-Command wsl.exe -ErrorAction Stop).Source
    $networkScript = Join-Path $PSScriptRoot 'preview-network.ps1'
    if (-not (Test-Path -LiteralPath $networkScript)) { throw 'Falta preview-network.ps1 junto a este archivo.' }
    if (-not $CheckOnly) {
        $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            $command = '& ' + (Quote-PS $PSCommandPath) + ' -Subnet ' + (Quote-PS $Subnet) +
                ' -VpnSubnet ' + (Quote-PS $VpnSubnet) + ' -Distro ' + (Quote-PS $Distro) +
                ' -RepoPath ' + (Quote-PS $RepoPath)
            if ($NoKeepAwake) { $command += ' -NoKeepAwake' }
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
            $process = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
                -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) -Wait -PassThru
            exit $process.ExitCode
        }
        & $networkScript -Subnet $Subnet -VpnSubnet $VpnSubnet
    }

    $python = @'
import importlib.util
import subprocess
import sys
import urllib.error
from pathlib import Path

try:
    root = Path(sys.argv[1])
    check_only = sys.argv[2] == 'check'
    launcher = root / 'scripts/preview-local.py'
    if not root.is_absolute() or not launcher.is_file():
        raise RuntimeError('No se encuentra el repositorio en WSL: ' + str(root))
    spec = importlib.util.spec_from_file_location('preview', launcher)
    preview = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(preview)

    def status(url):
        try:
            with preview.OPENER.open(url, timeout=20) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def healthy():
        pids = preview.read('pids.json', {})
        if not all(pids.get(name) and preview.owned(name, pids[name])
                   for name in ('backend', 'frontend', 'proxy')):
            return False
        try:
            return (status('http://127.0.0.1:3100/tours') == 200
                    and status('http://127.0.0.1:3101/health') == 200)
        except (OSError, TimeoutError):
            return False

    if not healthy():
        if check_only:
            raise RuntimeError('La app no esta lista. Ejecuta preview-trip.cmd para arrancarla.')
        print('Arrancando la app; se conserva la seleccion de tours guardada.', flush=True)
        preview.stop()
        command = [sys.executable, str(launcher), 'start']
        if (root / 'frontend/.next/BUILD_ID').is_file():
            command.append('--skip-build')
        subprocess.run(command, cwd=root, check=True)
        if not healthy():
            raise RuntimeError('La app no responde despues de arrancarla. Revisa sus logs.')
    else:
        print('La app ya funciona; se conservan los procesos actuales.', flush=True)
    code = status('http://127.0.0.1:3100/api/backend/tours?readyOnly=true')
    if code != 200:
        raise RuntimeError('El catalogo no esta disponible: HTTP ' + str(code))
    print('Web, backend y catalogo: OK.', flush=True)
    preview.addresses()
except Exception as error:
    print('Error: ' + str(error), file=sys.stderr)
    sys.exit(1)
'@
    $mode = if ($CheckOnly) { 'check' } else { 'start' }
    # Encode the inline program so Windows command-line quoting cannot change it.
    $code = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($python))
    $bootstrap = "import base64;exec(base64.b64decode('$code'))"
    $wslArguments = @('--distribution', $Distro, '--exec', 'python3', '-c', $bootstrap, $RepoPath, $mode)
    $argumentLine = ($wslArguments | ForEach-Object { Quote-Native $_ }) -join ' '
    $outputLog = [IO.Path]::GetTempFileName()
    $errorLog = [IO.Path]::GetTempFileName()
    try {
        Write-Host 'Comprobando la app en WSL; el primer arranque puede tardar si necesita compilar.'
        $process = Start-Process -FilePath $wsl -ArgumentList $argumentLine -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog
        Get-Content -LiteralPath $outputLog | ForEach-Object { Write-Host $_ }
        Get-Content -LiteralPath $errorLog | ForEach-Object { Write-Host $_ -ForegroundColor Red }
        if ($process.ExitCode -ne 0) { throw 'No se pudo preparar la app. Revisa el error anterior y PostgreSQL en WSL.' }
    } finally {
        Remove-Item -LiteralPath $outputLog, $errorLog -ErrorAction SilentlyContinue
    }
    if ($CheckOnly) { exit 0 }
    Write-Host 'Acceso preparado: conecta WireGuard en el movil y abre la direccion de red local.' -ForegroundColor Green
    if ($NoKeepAwake) {
        Write-Host 'El PC debe permanecer encendido. No se ha activado el permiso para evitar la suspension.'
        exit 0
    }

    if (-not ('TourGuideTrip.Power' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
namespace TourGuideTrip {
    public static class Power {
        [DllImport("kernel32.dll")]
        public static extern uint SetThreadExecutionState(uint flags);
    }
}
'@
    }
    if ([TourGuideTrip.Power]::SetThreadExecutionState([uint32]2147483649) -eq 0) {
        throw 'Windows no pudo activar el permiso para mantener el PC despierto.'
    }
    $awake = $true
    Write-Host 'LISTO PARA EL VIAJE. Deja esta ventana abierta y el PC enchufado.' -ForegroundColor Green
    Write-Host 'La pantalla puede apagarse. No suspendas el PC ni cierres la tapa del portatil.'
    Write-Host 'Tras reiniciar Windows, vuelve a ejecutar preview-trip.cmd.'
    Write-Host 'Al cerrar esta ventana, la app sigue abierta pero el PC vuelve a poder suspenderse.'
    while ($true) { Start-Sleep -Seconds 30 }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($awake) { [TourGuideTrip.Power]::SetThreadExecutionState([uint32]2147483648) | Out-Null }
}

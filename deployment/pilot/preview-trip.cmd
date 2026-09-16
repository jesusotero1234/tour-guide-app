@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0preview-trip.ps1" %*
if errorlevel 1 (
    echo No se pudo preparar la app. Revisa el error anterior.
    pause
    exit /b 1
)

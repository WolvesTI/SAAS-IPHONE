@echo off
chcp 65001 > nul
echo.
echo ===========================================
echo   SaaS Backend - Iniciando Servidor
echo ===========================================
echo.

cd /d "C:\Users\WolvesTI\Desktop\saas-backend"

if not exist node_modules (
    echo Instalando dependencias...
    call npm install
    echo.
)

echo Iniciando servidor en http://localhost:3001
echo.
echo Servicios disponibles:
echo   - CyberGuard:    http://localhost:3001/api/cyerguard
echo   - EngineerGo:    http://localhost:3001/api/engineergo
echo   - iSecure Audit:   http://localhost:3001/api/isecure
echo.
echo Documentacion: http://localhost:3001/api/docs
echo.
echo Presiona Ctrl+C para detener
echo ===========================================
echo.

node server.js

pause

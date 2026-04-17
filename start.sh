# SaaS Backend - Script de Inicio

cd "$(dirname "$0")"

echo ""
echo "==========================================="
echo "  SaaS Backend - Iniciando Servidor"
echo "==========================================="
echo ""

if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install
    echo ""
fi

echo "Iniciando servidor en http://localhost:3001"
echo ""
echo "Servicios disponibles:"
echo "  - CyberGuard:    http://localhost:3001/api/cyberguard"
echo "  - EngineerGo:    http://localhost:3001/api/engineergo"
echo "  - iSecure Audit: http://localhost:3001/api/isecure"
echo ""
echo "Documentacion: http://localhost:3001/api/docs"
echo ""
echo "Presiona Ctrl+C para detener"
echo "==========================================="
echo ""

node server.js

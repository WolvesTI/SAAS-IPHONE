const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Importar rutas
const authRoutes = require('./routes/auth');
const cyberguardRoutes = require('./routes/cyberguard');
const engineergoRoutes = require('./routes/engineergo');
const isecureRoutes = require('./routes/isecure');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*', // En producción, especificar dominios permitidos
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/cyberguard', cyberguardRoutes);
app.use('/api/engineergo', engineergoRoutes);
app.use('/api/isecure', isecureRoutes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'SaaS Backend API',
    version: '1.0.0',
    services: [
      { name: 'CyberGuard', path: '/api/cyberguard', description: 'Plataforma de ciberseguridad' },
      { name: 'EngineerGo', path: '/api/engineergo', description: 'Marketplace de profesionales IT' },
      { name: 'iSecure Audit', path: '/api/isecure', description: 'Auditoría de seguridad iOS' }
    ],
    endpoints: {
      auth: '/api/auth',
      health: '/health'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Ruta de documentación básica de API
app.get('/api/docs', (req, res) => {
  res.json({
    documentation: 'API Documentation',
    base_url: `http://localhost:${PORT}`,
    authentication: {
      type: 'JWT Bearer Token',
      header: 'Authorization: Bearer <token>',
      endpoints: {
        login: { method: 'POST', path: '/api/auth/login', body: { email: 'string', password: 'string' } },
        register: { method: 'POST', path: '/api/auth/register', body: { email: 'string', password: 'string', name: 'string' } }
      }
    },
    services: {
      cyberguard: {
        description: 'CyberGuard - Plataforma de Ciberseguridad',
        endpoints: [
          { method: 'GET', path: '/api/cyberguard/dashboard', auth: true },
          { method: 'POST', path: '/api/cyberguard/scan', auth: true, body: { target_url: 'string' } },
          { method: 'GET', path: '/api/cyberguard/scan/:id', auth: true },
          { method: 'GET', path: '/api/cyberguard/scans', auth: true },
          { method: 'GET', path: '/api/cyberguard/threats', auth: true },
          { method: 'GET', path: '/api/cyberguard/recommendations', auth: true },
          { method: 'POST', path: '/api/cyberguard/reports', auth: true }
        ]
      },
      engineergo: {
        description: 'EngineerGo - Marketplace IT',
        endpoints: [
          { method: 'GET', path: '/api/engineergo/professionals', auth: true },
          { method: 'GET', path: '/api/engineergo/professionals/nearby?lat=&lng=&service=', auth: true },
          { method: 'GET', path: '/api/engineergo/professionals/:id', auth: true },
          { method: 'POST', path: '/api/engineergo/bookings', auth: true },
          { method: 'GET', path: '/api/engineergo/bookings', auth: true },
          { method: 'POST', path: '/api/engineergo/payments', auth: true }
        ]
      },
      isecure: {
        description: 'iSecure Audit - Auditoría iOS',
        endpoints: [
          { method: 'POST', path: '/api/isecure/audits', auth: true },
          { method: 'GET', path: '/api/isecure/audits', auth: true },
          { method: 'GET', path: '/api/isecure/audits/:id', auth: true },
          { method: 'PUT', path: '/api/isecure/audits/:id', auth: true },
          { method: 'DELETE', path: '/api/isecure/audits/:id', auth: true },
          { method: 'POST', path: '/api/isecure/audits/:id/export', auth: true },
          { method: 'GET', path: '/api/isecure/benchmarks', auth: true }
        ]
      }
    }
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// Manejo de errores generales
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('  SaaS Backend Server');
  console.log('='.repeat(60));
  console.log(`  Servidor corriendo en: http://localhost:${PORT}`);
  console.log('  Servicios disponibles:');
  console.log('    • CyberGuard    - /api/cyberguard');
  console.log('    • EngineerGo    - /api/engineergo');
  console.log('    • iSecure Audit - /api/isecure');
  console.log('  Autenticación:      /api/auth');
  console.log('  Documentación:      /api/docs');
  console.log('  Health Check:       /health');
  console.log('='.repeat(60));
});

module.exports = app;

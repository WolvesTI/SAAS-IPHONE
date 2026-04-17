const express = require('express');
const { query, run, get } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { runScan, generateRecommendations } = require('../services/scanner');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// GET /api/cyberguard/dashboard - Estadísticas del dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;

    // Contar escaneos del usuario
    const scanStats = await get(`
      SELECT
        COUNT(*) as total_scans,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_scans,
        AVG(score) as avg_score
      FROM cg_scans WHERE user_id = ?
    `, [userId]);

    // Contar amenazas activas
    const threatsCount = await get(`
      SELECT COUNT(*) as count FROM cg_threats
      WHERE user_id = ? AND status = 'active'
    `, [userId]);

    // Último escaneo
    const lastScan = await get(`
      SELECT * FROM cg_scans
      WHERE user_id = ? AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `, [userId]);

    // Vulnerabilidades recientes
    const recentVulns = await query(`
      SELECT v.*, s.target_url
      FROM cg_vulnerabilities v
      JOIN cg_scans s ON v.scan_id = s.id
      WHERE s.user_id = ?
      ORDER BY v.id DESC LIMIT 5
    `, [userId]);

    // Calcular sistemas protegidos (basado en score promedio)
    const avgScore = scanStats.avg_score || 0;
    const protectedPercentage = Math.min(100, Math.round(avgScore));

    res.json({
      stats: {
        total_scans: scanStats.total_scans || 0,
        vulnerabilities: recentVulns.length,
        threats_active: threatsCount.count || 0,
        protected_percentage: protectedPercentage,
        avg_score: Math.round(avgScore) || 0
      },
      last_scan: lastScan || null,
      recent_vulnerabilities: recentVulns
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// POST /api/cyberguard/scan - Iniciar nuevo escaneo
router.post('/scan', async (req, res) => {
  try {
    const userId = req.user.id;
    const { target_url } = req.body;

    if (!target_url) {
      return res.status(400).json({ error: 'URL objetivo requerida' });
    }

    // Crear registro de escaneo
    const result = await run(
      'INSERT INTO cg_scans (user_id, target_url, status, progress) VALUES (?, ?, ?, ?)',
      [userId, target_url, 'pending', 0]
    );

    const scanId = result.id;

    // Iniciar escaneo asíncrono
    runScanAsync(scanId, target_url);

    res.json({
      message: 'Escaneo iniciado',
      scan: {
        id: scanId,
        target_url,
        status: 'pending',
        progress: 0
      }
    });
  } catch (error) {
    console.error('Error al iniciar escaneo:', error);
    res.status(500).json({ error: 'Error al iniciar escaneo' });
  }
});

// Función async para ejecutar escaneo
async function runScanAsync(scanId, targetUrl) {
  try {
    // Simular progreso
    for (let progress = 0; progress <= 100; progress += 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await run(
        'UPDATE cg_scans SET progress = ? WHERE id = ?',
        [progress, scanId]
      );
    }

    // Ejecutar escaneo real
    const scanResults = await runScan(targetUrl);

    // Guardar resultados
    await run(
      'UPDATE cg_scans SET status = ?, score = ?, findings = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', scanResults.score, JSON.stringify(scanResults.findings || []), scanId]
    );

    // Guardar vulnerabilidades encontradas
    if (scanResults.vulnerabilities && scanResults.vulnerabilities.length > 0) {
      for (const vuln of scanResults.vulnerabilities) {
        await run(
          'INSERT INTO cg_vulnerabilities (scan_id, name, severity, description, remediation) VALUES (?, ?, ?, ?, ?)',
          [scanId, vuln.name, vuln.severity, vuln.description, vuln.remediation]
        );
      }
    }

    // Crear algunas amenazas simuladas basadas en hallazgos
    if (scanResults.score < 70) {
      await run(
        'INSERT INTO cg_threats (user_id, type, source, severity, status) VALUES (?, ?, ?, ?, ?)',
        [1, 'vulnerability', targetUrl, 'high', 'active']
      );
    }

  } catch (error) {
    console.error('Error en escaneo async:', error);
    await run(
      'UPDATE cg_scans SET status = ? WHERE id = ?',
      ['failed', scanId]
    );
  }
}

// GET /api/cyberguard/scan/:id - Obtener estado/resultados de escaneo
router.get('/scan/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const scanId = req.params.id;

    const scan = await get(`
      SELECT * FROM cg_scans WHERE id = ? AND user_id = ?
    `, [scanId, userId]);

    if (!scan) {
      return res.status(404).json({ error: 'Escaneo no encontrado' });
    }

    // Obtener vulnerabilidades del escaneo
    const vulnerabilities = await query(`
      SELECT * FROM cg_vulnerabilities WHERE scan_id = ?
    `, [scanId]);

    res.json({
      scan: {
        ...scan,
        findings: scan.findings ? JSON.parse(scan.findings) : []
      },
      vulnerabilities
    });
  } catch (error) {
    console.error('Error al obtener escaneo:', error);
    res.status(500).json({ error: 'Error al obtener escaneo' });
  }
});

// GET /api/cyberguard/scans - Lista de escaneos del usuario
router.get('/scans', async (req, res) => {
  try {
    const userId = req.user.id;
    const scans = await query(`
      SELECT * FROM cg_scans WHERE user_id = ? ORDER BY created_at DESC
    `, [userId]);

    res.json({ scans });
  } catch (error) {
    console.error('Error al obtener escaneos:', error);
    res.status(500).json({ error: 'Error al obtener escaneos' });
  }
});

// GET /api/cyberguard/threats - Lista de amenazas
router.get('/threats', async (req, res) => {
  try {
    const userId = req.user.id;
    const threats = await query(`
      SELECT * FROM cg_threats WHERE user_id = ? ORDER BY detected_at DESC
    `, [userId]);

    res.json({ threats });
  } catch (error) {
    console.error('Error al obtener amenazas:', error);
    res.status(500).json({ error: 'Error al obtener amenazas' });
  }
});

// PATCH /api/cyberguard/threats/:id - Actualizar estado de amenaza
router.patch('/threats/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const threatId = req.params.id;
    const { status } = req.body;

    await run(
      'UPDATE cg_threats SET status = ? WHERE id = ? AND user_id = ?',
      [status, threatId, userId]
    );

    res.json({ message: 'Amenaza actualizada' });
  } catch (error) {
    console.error('Error al actualizar amenaza:', error);
    res.status(500).json({ error: 'Error al actualizar amenaza' });
  }
});

// GET /api/cyberguard/recommendations - Obtener recomendaciones
router.get('/recommendations', async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener último escaneo completado
    const lastScan = await get(`
      SELECT * FROM cg_scans
      WHERE user_id = ? AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `, [userId]);

    if (!lastScan) {
      return res.json({
        recommendations: [
          {
            priority: 'info',
            title: 'Iniciar primer escaneo',
            description: 'Realiza tu primer escaneo para obtener recomendaciones personalizadas.',
            action: 'Ir al escáner y analizar un objetivo'
          }
        ]
      });
    }

    // Generar recomendaciones basadas en el escaneo
    const scanResults = {
      target: lastScan.target_url,
      score: lastScan.score,
      findings: lastScan.findings ? JSON.parse(lastScan.findings) : [],
      port_scan: [],
      ssl_check: { score: lastScan.score > 80 ? 90 : 60 },
      headers_check: { score: lastScan.score > 70 ? 85 : 50 },
      vulnerabilities: await query('SELECT * FROM cg_vulnerabilities WHERE scan_id = ?', [lastScan.id])
    };

    const recommendations = generateRecommendations(scanResults);

    res.json({ recommendations });
  } catch (error) {
    console.error('Error al obtener recomendaciones:', error);
    res.status(500).json({ error: 'Error al obtener recomendaciones' });
  }
});

// POST /api/cyberguard/reports - Generar reporte
router.post('/reports', async (req, res) => {
  try {
    const userId = req.user.id;
    const { scan_id, title, format = 'json' } = req.body;

    // Obtener datos del escaneo
    const scan = await get(`
      SELECT * FROM cg_scans WHERE id = ? AND user_id = ?
    `, [scan_id, userId]);

    if (!scan) {
      return res.status(404).json({ error: 'Escaneo no encontrado' });
    }

    const vulnerabilities = await query(`
      SELECT * FROM cg_vulnerabilities WHERE scan_id = ?
    `, [scan_id]);

    // Crear contenido del reporte
    const reportContent = {
      title: title || `Reporte de Seguridad - ${scan.target_url}`,
      generated_at: new Date().toISOString(),
      target: scan.target_url,
      score: scan.score,
      scan_date: scan.completed_at,
      vulnerabilities,
      summary: {
        total: vulnerabilities.length,
        critical: vulnerabilities.filter(v => v.severity === 'critical').length,
        high: vulnerabilities.filter(v => v.severity === 'high').length,
        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
        low: vulnerabilities.filter(v => v.severity === 'low').length
      }
    };

    // Guardar reporte
    const result = await run(
      'INSERT INTO cg_reports (user_id, scan_id, title, format, content) VALUES (?, ?, ?, ?, ?)',
      [userId, scan_id, reportContent.title, format, JSON.stringify(reportContent)]
    );

    res.json({
      message: 'Reporte generado exitosamente',
      report: {
        id: result.id,
        ...reportContent
      }
    });
  } catch (error) {
    console.error('Error al generar reporte:', error);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
});

// GET /api/cyberguard/reports - Lista de reportes
router.get('/reports', async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await query(`
      SELECT r.*, s.target_url
      FROM cg_reports r
      JOIN cg_scans s ON r.scan_id = s.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `, [userId]);

    res.json({ reports });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

module.exports = router;

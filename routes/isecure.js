const express = require('express');
const { query, run, get } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { calculateAuditScore, generateRecommendations, generateReport } = require('../services/scoring');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// POST /api/isecure/audits - Crear nueva auditoría
router.post('/audits', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      device_model,
      ios_version,
      passcode,
      jailbroken = false,
      twoFactorAuth = false,
      findMyIphone = false,
      usbRestricted = false,
      unknownProfiles = false,
      sideloading = false,
      autoJoinWifi = false
    } = req.body;

    if (!device_model || !ios_version) {
      return res.status(400).json({ error: 'Modelo del dispositivo y versión iOS son requeridos' });
    }

    // Calcular score
    const checks = {
      passcode: passcode || 'none',
      jailbroken,
      twoFactorAuth,
      findMyIphone,
      usbRestricted,
      unknownProfiles,
      sideloading,
      autoJoinWifi
    };

    const scoring = calculateAuditScore(checks);

    // Crear auditoría
    const result = await run(
      `INSERT INTO is_audits (user_id, device_model, ios_version, passcode_type, score, status, findings)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        device_model,
        ios_version,
        passcode || 'none',
        scoring.score,
        'completed',
        JSON.stringify(scoring.findings)
      ]
    );

    const auditId = result.id;

    // Guardar cada check individual
    const checksToSave = [
      { name: 'passcode', value: passcode !== 'none', severity: scoring.findings.find(f => f.type === 'passcode')?.severity || 'good', points: 0 },
      { name: 'jailbroken', value: !jailbroken, severity: jailbroken ? 'critical' : 'good', points: jailbroken ? -30 : 0 },
      { name: 'twoFactorAuth', value: twoFactorAuth, severity: twoFactorAuth ? 'good' : 'high', points: twoFactorAuth ? 15 : 0 },
      { name: 'findMyIphone', value: findMyIphone, severity: findMyIphone ? 'good' : 'medium', points: findMyIphone ? 10 : 0 },
      { name: 'usbRestricted', value: usbRestricted, severity: usbRestricted ? 'good' : 'medium', points: usbRestricted ? 10 : 0 },
      { name: 'unknownProfiles', value: !unknownProfiles, severity: unknownProfiles ? 'high' : 'good', points: unknownProfiles ? -20 : 0 },
      { name: 'sideloading', value: !sideloading, severity: sideloading ? 'high' : 'good', points: sideloading ? -15 : 0 },
      { name: 'autoJoinWifi', value: !autoJoinWifi, severity: autoJoinWifi ? 'medium' : 'good', points: autoJoinWifi ? -10 : 0 }
    ];

    for (const check of checksToSave) {
      await run(
        'INSERT INTO is_audit_checks (audit_id, check_name, check_value, severity, points) VALUES (?, ?, ?, ?, ?)',
        [auditId, check.name, check.value ? 1 : 0, check.severity, check.points]
      );
    }

    // Generar recomendaciones
    const recommendations = generateRecommendations(scoring.findings);

    res.status(201).json({
      message: 'Auditoría creada exitosamente',
      audit: {
        id: auditId,
        device_model,
        ios_version,
        score: scoring.score,
        risk_level: scoring.risk_level,
        passed_checks: scoring.passed_checks,
        total_checks: scoring.total_checks,
        findings: scoring.findings,
        recommendations,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error al crear auditoría:', error);
    res.status(500).json({ error: 'Error al crear auditoría' });
  }
});

// GET /api/isecure/audits - Lista de auditorías del usuario
router.get('/audits', async (req, res) => {
  try {
    const userId = req.user.id;

    const audits = await query(`
      SELECT id, device_model, ios_version, score, risk_level, status, created_at
      FROM is_audits
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      audits: audits.map(a => ({
        ...a,
        findings: a.findings ? JSON.parse(a.findings) : []
      }))
    });
  } catch (error) {
    console.error('Error al obtener auditorías:', error);
    res.status(500).json({ error: 'Error al obtener auditorías' });
  }
});

// GET /api/isecure/audits/:id - Detalle de auditoría
router.get('/audits/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const auditId = req.params.id;

    const audit = await get(`
      SELECT * FROM is_audits WHERE id = ? AND user_id = ?
    `, [auditId, userId]);

    if (!audit) {
      return res.status(404).json({ error: 'Auditoría no encontrada' });
    }

    // Obtener checks individuales
    const checks = await query(`
      SELECT * FROM is_audit_checks WHERE audit_id = ?
    `, [auditId]);

    const findings = audit.findings ? JSON.parse(audit.findings) : [];
    const recommendations = generateRecommendations(findings);

    res.json({
      audit: {
        ...audit,
        findings,
        checks: checks.map(c => ({
          ...c,
          check_value: c.check_value === 1
        })),
        recommendations
      }
    });
  } catch (error) {
    console.error('Error al obtener auditoría:', error);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// PUT /api/isecure/audits/:id - Actualizar auditoría
router.put('/audits/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const auditId = req.params.id;
    const updates = req.body;

    // Verificar que la auditoría existe y pertenece al usuario
    const existing = await get(
      'SELECT id FROM is_audits WHERE id = ? AND user_id = ?',
      [auditId, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Auditoría no encontrada' });
    }

    // Recalcular score si cambiaron los checks
    const checks = {
      passcode: updates.passcode || 'none',
      jailbroken: updates.jailbroken || false,
      twoFactorAuth: updates.twoFactorAuth || false,
      findMyIphone: updates.findMyIphone || false,
      usbRestricted: updates.usbRestricted || false,
      unknownProfiles: updates.unknownProfiles || false,
      sideloading: updates.sideloading || false,
      autoJoinWifi: updates.autoJoinWifi || false
    };

    const scoring = calculateAuditScore(checks);

    // Actualizar auditoría
    await run(
      `UPDATE is_audits SET
        device_model = ?,
        ios_version = ?,
        passcode_type = ?,
        score = ?,
        findings = ?
      WHERE id = ?`,
      [
        updates.device_model,
        updates.ios_version,
        updates.passcode,
        scoring.score,
        JSON.stringify(scoring.findings),
        auditId
      ]
    );

    // Actualizar checks
    await run('DELETE FROM is_audit_checks WHERE audit_id = ?', [auditId]);

    const checksToSave = [
      { name: 'passcode', value: updates.passcode !== 'none', severity: scoring.findings.find(f => f.type === 'passcode')?.severity || 'good' },
      { name: 'jailbroken', value: !updates.jailbroken, severity: updates.jailbroken ? 'critical' : 'good', points: updates.jailbroken ? -30 : 0 },
      { name: 'twoFactorAuth', value: updates.twoFactorAuth, severity: updates.twoFactorAuth ? 'good' : 'high', points: updates.twoFactorAuth ? 15 : 0 },
      { name: 'findMyIphone', value: updates.findMyIphone, severity: updates.findMyIphone ? 'good' : 'medium', points: updates.findMyIphone ? 10 : 0 },
      { name: 'usbRestricted', value: updates.usbRestricted, severity: updates.usbRestricted ? 'good' : 'medium', points: updates.usbRestricted ? 10 : 0 },
      { name: 'unknownProfiles', value: !updates.unknownProfiles, severity: updates.unknownProfiles ? 'high' : 'good', points: updates.unknownProfiles ? -20 : 0 },
      { name: 'sideloading', value: !updates.sideloading, severity: updates.sideloading ? 'high' : 'good', points: updates.sideloading ? -15 : 0 },
      { name: 'autoJoinWifi', value: !updates.autoJoinWifi, severity: updates.autoJoinWifi ? 'medium' : 'good', points: updates.autoJoinWifi ? -10 : 0 }
    ];

    for (const check of checksToSave) {
      await run(
        'INSERT INTO is_audit_checks (audit_id, check_name, check_value, severity, points) VALUES (?, ?, ?, ?, ?)',
        [auditId, check.name, check.value ? 1 : 0, check.severity, check.points || 0]
      );
    }

    res.json({
      message: 'Auditoría actualizada',
      audit: {
        id: auditId,
        score: scoring.score,
        risk_level: scoring.risk_level,
        findings: scoring.findings
      }
    });
  } catch (error) {
    console.error('Error al actualizar auditoría:', error);
    res.status(500).json({ error: 'Error al actualizar auditoría' });
  }
});

// DELETE /api/isecure/audits/:id - Eliminar auditoría
router.delete('/audits/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const auditId = req.params.id;

    const existing = await get(
      'SELECT id FROM is_audits WHERE id = ? AND user_id = ?',
      [auditId, userId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Auditoría no encontrada' });
    }

    // Eliminar checks primero
    await run('DELETE FROM is_audit_checks WHERE audit_id = ?', [auditId]);

    // Eliminar reportes asociados
    await run('DELETE FROM is_reports WHERE audit_id = ?', [auditId]);

    // Eliminar auditoría
    await run('DELETE FROM is_audits WHERE id = ?', [auditId]);

    res.json({ message: 'Auditoría eliminada' });
  } catch (error) {
    console.error('Error al eliminar auditoría:', error);
    res.status(500).json({ error: 'Error al eliminar auditoría' });
  }
});

// POST /api/isecure/audits/:id/export - Exportar reporte
router.post('/audits/:id/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const auditId = req.params.id;
    const { format = 'json' } = req.body;

    const audit = await get(`
      SELECT * FROM is_audits WHERE id = ? AND user_id = ?
    `, [auditId, userId]);

    if (!audit) {
      return res.status(404).json({ error: 'Auditoría no encontrada' });
    }

    const checks = await query(`
      SELECT * FROM is_audit_checks WHERE audit_id = ?
    `, [auditId]);

    const findings = audit.findings ? JSON.parse(audit.findings) : [];
    const recommendations = generateRecommendations(findings);

    const reportData = {
      device_model: audit.device_model,
      ios_version: audit.ios_version,
      score: audit.score,
      risk_level: audit.risk_level,
      findings,
      recommendations,
      checks: checks.map(c => ({
        ...c,
        check_value: c.check_value === 1
      })),
      exported_at: new Date().toISOString()
    };

    // Guardar reporte
    const result = await run(
      'INSERT INTO is_reports (audit_id, format, content) VALUES (?, ?, ?)',
      [auditId, format, JSON.stringify(reportData)]
    );

    const report = generateReport(reportData);

    res.json({
      message: 'Reporte exportado exitosamente',
      report: {
        id: result.id,
        ...report,
        format
      }
    });
  } catch (error) {
    console.error('Error al exportar reporte:', error);
    res.status(500).json({ error: 'Error al exportar reporte' });
  }
});

// GET /api/isecure/reports - Lista de reportes
router.get('/reports', async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await query(`
      SELECT r.*, a.device_model, a.ios_version
      FROM is_reports r
      JOIN is_audits a ON r.audit_id = a.id
      WHERE a.user_id = ?
      ORDER BY r.created_at DESC
    `, [userId]);

    res.json({ reports });
  } catch (error) {
    console.error('Error al obtener reportes:', error);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// GET /api/isecure/benchmarks - Puntuaciones de referencia
router.get('/benchmarks', async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        AVG(score) as avg_score,
        MIN(score) as min_score,
        MAX(score) as max_score,
        COUNT(*) as total_audits
      FROM is_audits
    `);

    // Distribución de scores
    const distribution = await query(`
      SELECT
        CASE
          WHEN score >= 80 THEN 'excellent'
          WHEN score >= 60 THEN 'good'
          WHEN score >= 40 THEN 'fair'
          ELSE 'poor'
        END as category,
        COUNT(*) as count
      FROM is_audits
      GROUP BY category
    `);

    res.json({
      benchmarks: {
        average_score: Math.round(stats[0].avg_score || 65),
        min_score: stats[0].min_score || 20,
        max_score: stats[0].max_score || 100,
        total_audits: stats[0].total_audits || 0,
        distribution: distribution.reduce((acc, curr) => {
          acc[curr.category] = curr.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Error al obtener benchmarks:', error);
    res.status(500).json({ error: 'Error al obtener benchmarks' });
  }
});

// GET /api/isecure/checks - Lista de checks disponibles
router.get('/checks', async (req, res) => {
  try {
    const { SECURITY_CHECKS } = require('../services/scoring');

    res.json({
      checks: [
        {
          id: 'passcode',
          name: 'Tipo de Passcode',
          description: 'Evalúa la fortaleza del código de desbloqueo',
          options: ['alphanumeric', '6digit', '4digit', 'none']
        },
        {
          id: 'jailbroken',
          name: 'Estado de Jailbreak',
          description: 'Detecta si el dispositivo tiene jailbreak',
          type: 'boolean'
        },
        {
          id: 'twoFactorAuth',
          name: 'Autenticación de 2 Factores',
          description: 'Verifica si 2FA está activado en Apple ID',
          type: 'boolean'
        },
        {
          id: 'findMyIphone',
          name: 'Find My iPhone',
          description: 'Verifica si Buscar mi iPhone está activado',
          type: 'boolean'
        },
        {
          id: 'usbRestricted',
          name: 'Modo USB Restringido',
          description: 'Verifica restricciones de accesorios USB',
          type: 'boolean'
        },
        {
          id: 'unknownProfiles',
          name: 'Perfiles/MDM Desconocidos',
          description: 'Detecta perfiles de configuración no autorizados',
          type: 'boolean'
        },
        {
          id: 'sideloading',
          name: 'Sideloading',
          description: 'Detecta aplicaciones instaladas fuera de App Store',
          type: 'boolean'
        },
        {
          id: 'autoJoinWifi',
          name: 'Auto-conexión Wi-Fi',
          description: 'Verifica conexión automática a redes abiertas',
          type: 'boolean'
        }
      ]
    });
  } catch (error) {
    console.error('Error al obtener checks:', error);
    res.status(500).json({ error: 'Error al obtener checks' });
  }
});

module.exports = router;

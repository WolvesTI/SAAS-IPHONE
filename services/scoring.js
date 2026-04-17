// Servicio de scoring para iSecure Audit

// Definición de checks de seguridad iOS
const SECURITY_CHECKS = {
  passcode: {
    name: 'Tipo de Passcode',
    options: {
      'alphanumeric': { score: 20, severity: 'good', description: 'Contraseña alfanumérica o 6+ dígitos' },
      '6digit': { score: 15, severity: 'good', description: 'Código de 6 dígitos' },
      '4digit': { score: 5, severity: 'medium', description: 'Código de 4 dígitos (débil)' },
      'none': { score: -30, severity: 'critical', description: 'Sin código de bloqueo' }
    }
  },
  jailbroken: {
    name: 'Estado de Jailbreak',
    check: false, // false = bueno
    weight: -30,
    severity: 'critical',
    description: 'Dispositivo con jailbreak detectado'
  },
  twoFactorAuth: {
    name: 'Autenticación de 2 Factores',
    check: true, // true = bueno
    weight: 15,
    severity: 'good',
    description: '2FA activado en Apple ID'
  },
  findMyIphone: {
    name: 'Find My iPhone',
    check: true,
    weight: 10,
    severity: 'good',
    description: 'Buscar mi iPhone activado'
  },
  usbRestricted: {
    name: 'Modo USB Restringido',
    check: true,
    weight: 10,
    severity: 'good',
    description: 'Accesorios USB restringidos al bloquearse'
  },
  unknownProfiles: {
    name: 'Perfiles/MDM Desconocidos',
    check: false, // false = bueno (no debería haber)
    weight: -20,
    severity: 'high',
    description: 'Perfiles o MDM no autorizados instalados'
  },
  sideloading: {
    name: 'Sideloading',
    check: false,
    weight: -15,
    severity: 'high',
    description: 'Aplicaciones instaladas fuera de App Store'
  },
  autoJoinWifi: {
    name: 'Auto-conexión Wi-Fi',
    check: false,
    weight: -10,
    severity: 'medium',
    description: 'Conexión automática a redes Wi-Fi abiertas permitida'
  }
};

// Calcular score basado en respuestas del checklist
function calculateAuditScore(checks) {
  let totalScore = 0;
  const findings = [];
  let passedChecks = 0;
  let totalChecks = 0;

  // Evaluar tipo de passcode
  const passcodeConfig = SECURITY_CHECKS.passcode;
  const passcodeValue = checks.passcode || 'none';
  const passcodeResult = passcodeConfig.options[passcodeValue];

  if (passcodeResult) {
    totalScore += passcodeResult.score;
    if (passcodeResult.severity !== 'good') {
      findings.push({
        type: 'passcode',
        severity: passcodeResult.severity,
        description: passcodeResult.description,
        points: passcodeResult.score
      });
    } else {
      passedChecks++;
    }
  }
  totalChecks++;

  // Evaluar checks booleanos
  const booleanChecks = [
    { key: 'jailbroken', config: SECURITY_CHECKS.jailbroken },
    { key: 'twoFactorAuth', config: SECURITY_CHECKS.twoFactorAuth },
    { key: 'findMyIphone', config: SECURITY_CHECKS.findMyIphone },
    { key: 'usbRestricted', config: SECURITY_CHECKS.usbRestricted },
    { key: 'unknownProfiles', config: SECURITY_CHECKS.unknownProfiles },
    { key: 'sideloading', config: SECURITY_CHECKS.sideloading },
    { key: 'autoJoinWifi', config: SECURITY_CHECKS.autoJoinWifi }
  ];

  booleanChecks.forEach(({ key, config }) => {
    const value = checks[key] || false;
    const isGood = config.check === value; // Si coincide con el valor esperado

    if (isGood) {
      totalScore += config.weight;
      passedChecks++;
    } else {
      totalScore += Math.abs(config.weight) * (config.weight < 0 ? -1 : 0);
      findings.push({
        type: key,
        severity: config.severity,
        description: config.description,
        points: config.weight
      });
    }
    totalChecks++;
  });

  // Normalizar score a rango 0-100
  const normalizedScore = Math.max(0, Math.min(100, 50 + totalScore));

  // Determinar nivel de riesgo
  let riskLevel;
  if (normalizedScore >= 80) riskLevel = 'high';
  else if (normalizedScore >= 60) riskLevel = 'medium';
  else if (normalizedScore >= 40) riskLevel = 'low';
  else riskLevel = 'critical';

  return {
    score: normalizedScore,
    risk_level: riskLevel,
    passed_checks: passedChecks,
    total_checks: totalChecks,
    findings: findings.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
  };
}

// Generar recomendaciones basadas en hallazgos
function generateRecommendations(findings) {
  const recommendations = [];

  findings.forEach(finding => {
    let recommendation;

    switch (finding.type) {
      case 'passcode':
        if (finding.severity === 'critical') {
          recommendation = {
            priority: 'critical',
            title: 'Configurar código de bloqueo',
            action: 'Ve a Ajustes > Face ID y Código > Activar Código',
            impact: 'Sin código, cualquiera puede acceder a tu dispositivo'
          };
        } else if (finding.severity === 'medium') {
          recommendation = {
            priority: 'medium',
            title: 'Mejorar código de bloqueo',
            action: 'Cambia a código alfanumérico o de 6 dígitos en Ajustes > Face ID y Código',
            impact: 'Códigos de 4 dígitos son fáciles de fuerza bruta'
          };
        }
        break;

      case 'jailbroken':
        recommendation = {
          priority: 'critical',
          title: 'Restaurar dispositivo',
          action: 'Realiza una restauración completa desde iTunes/Finder',
          impact: 'Jailbreak elimina protecciones de seguridad esenciales'
        };
        break;

      case 'twoFactorAuth':
        recommendation = {
          priority: 'high',
          title: 'Activar Autenticación de Dos Factores',
          action: 'Ve a appleid.apple.com > Seguridad > Activar 2FA',
          impact: 'Protege tu cuenta Apple incluso si roban tu contraseña'
        };
        break;

      case 'findMyIphone':
        recommendation = {
          priority: 'medium',
          title: 'Activar Buscar mi iPhone',
          action: 'Ajustes > [Tu Nombre] > Buscar > Buscar mi iPhone',
          impact: 'Permite localizar y borrar remotamente tu dispositivo'
        };
        break;

      case 'usbRestricted':
        recommendation = {
          priority: 'medium',
          title: 'Activar Modo USB Restringido',
          action: 'Ajustes > Face ID y Código > Accesorios USB',
          impact: 'Previene ataques de dispositivos USB maliciosos'
        };
        break;

      case 'unknownProfiles':
        recommendation = {
          priority: 'high',
          title: 'Revisar perfiles instalados',
          action: 'Ajustes > General > VPN y Gestión del Dispositivo',
          impact: 'Perfiles desconocidos pueden comprometer tu privacidad'
        };
        break;

      case 'sideloading':
        recommendation = {
          priority: 'high',
          title: 'Eliminar apps sideloaded',
          action: 'Elimina aplicaciones instaladas fuera de App Store',
          impact: 'Apps no verificadas pueden contener malware'
        };
        break;

      case 'autoJoinWifi':
        recommendation = {
          priority: 'medium',
          title: 'Deshabilitar auto-conexión Wi-Fi',
          action: 'Ajustes > Wi-Fi > Desactivar "Preguntar para conectarse"',
          impact: 'Evita conexiones automáticas a redes maliciosas'
        };
        break;
    }

    if (recommendation) {
      recommendations.push(recommendation);
    }
  });

  return recommendations;
}

// Generar reporte detallado
function generateReport(auditData) {
  const { device_model, ios_version, score, risk_level, findings, recommendations } = auditData;

  const report = {
    summary: {
      device: device_model || 'iPhone Desconocido',
      ios_version: ios_version || 'Desconocida',
      audit_date: new Date().toISOString(),
      overall_score: score,
      risk_level: risk_level
    },
    security_posture: {
      status: score >= 80 ? 'EXCELENTE' : score >= 60 ? 'BUENA' : score >= 40 ? 'REGULAR' : 'CRÍTICA',
      description: getRiskDescription(risk_level),
      next_audit: 'Se recomienda auditoría mensual'
    },
    findings: findings,
    recommendations: recommendations,
    benchmarks: {
      your_score: score,
      average_score: 65,
      industry_best: 95
    }
  };

  return report;
}

function getRiskDescription(level) {
  const descriptions = {
    critical: 'El dispositivo tiene configuraciones de seguridad críticas que requieren atención inmediata.',
    low: 'El dispositivo tiene algunas debilidades que deberían corregirse.',
    medium: 'El dispositivo tiene una postura de seguridad aceptable con áreas de mejora.',
    high: 'El dispositivo tiene una excelente postura de seguridad.'
  };
  return descriptions[level] || descriptions.medium;
}

module.exports = {
  calculateAuditScore,
  generateRecommendations,
  generateReport,
  SECURITY_CHECKS
};

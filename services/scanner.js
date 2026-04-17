// Servicio de escaneo de vulnerabilidades para CyberGuard

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 3306, 3389, 5432, 8080, 8443];

const VULNERABILITY_DB = [
  { id: 'CVE-2023-1234', name: 'OpenSSL Buffer Overflow', severity: 'critical', description: 'Buffer overflow en OpenSSL permite ejecución remota', remediation: 'Actualizar OpenSSL a versión 3.0.8+' },
  { id: 'CVE-2023-5678', name: 'Apache Struts RCE', severity: 'critical', description: 'Ejecución remota de código en Apache Struts', remediation: 'Actualizar a Apache Struts 2.5.33+' },
  { id: 'CVE-2023-9012', name: 'SQL Injection WordPress', severity: 'high', description: 'Inyección SQL en plugin popular de WordPress', remediation: 'Actualizar plugin a versión más reciente' },
  { id: 'CVE-2023-3456', name: 'XSS en jQuery', severity: 'medium', description: 'Cross-site scripting en versión antigua de jQuery', remediation: 'Actualizar jQuery a 3.6.0+' },
  { id: 'CVE-2023-7890', name: 'Information Disclosure', severity: 'low', description: 'Divulgación de información en headers HTTP', remediation: 'Configurar headers de seguridad apropiadamente' }
];

// Simular escaneo de puertos
async function scanPorts(target) {
  const openPorts = [];
  // Simulación: 30% de probabilidad de puerto abierto
  for (const port of COMMON_PORTS) {
    if (Math.random() > 0.7) {
      openPorts.push({
        port,
        service: getServiceName(port),
        status: 'open'
      });
    }
  }
  return openPorts;
}

// Simular verificación de SSL/TLS
async function checkSSL(target) {
  const issues = [];
  const score = Math.floor(Math.random() * 40) + 60; // 60-100

  if (score < 80) {
    issues.push({
      type: 'ssl_version',
      severity: 'high',
      description: 'Versión TLS obsoleta detectada'
    });
  }

  if (score < 70) {
    issues.push({
      type: 'certificate',
      severity: 'medium',
      description: 'Certificado próximo a expirar'
    });
  }

  return { score, issues, valid: score >= 70 };
}

// Simular verificación de headers de seguridad
async function checkSecurityHeaders(target) {
  const requiredHeaders = [
    'Strict-Transport-Security',
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options'
  ];

  const missing = [];
  requiredHeaders.forEach(header => {
    if (Math.random() > 0.6) {
      missing.push(header);
    }
  });

  return {
    present: requiredHeaders.filter(h => !missing.includes(h)),
    missing,
    score: Math.floor(((requiredHeaders.length - missing.length) / requiredHeaders.length) * 100)
  };
}

// Generar vulnerabilidades aleatorias
function generateVulnerabilities(count = 5) {
  const vulns = [];
  const shuffled = [...VULNERABILITY_DB].sort(() => 0.5 - Math.random());

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    vulns.push({
      ...shuffled[i],
      detected_at: new Date().toISOString()
    });
  }

  return vulns;
}

// Calcular score general de seguridad
function calculateSecurityScore(portScan, sslCheck, headersCheck, vulns) {
  let score = 100;

  // Restar por puertos abiertos
  score -= portScan.length * 2;

  // Restar por SSL
  score -= (100 - sslCheck.score) * 0.3;

  // Restar por headers faltantes
  score -= (100 - headersCheck.score) * 0.2;

  // Restar por vulnerabilidades
  vulns.forEach(v => {
    if (v.severity === 'critical') score -= 15;
    else if (v.severity === 'high') score -= 10;
    else if (v.severity === 'medium') score -= 5;
    else score -= 2;
  });

  return Math.max(0, Math.round(score));
}

// Ejecutar escaneo completo
async function runScan(target) {
  const portScan = await scanPorts(target);
  const sslCheck = await checkSSL(target);
  const headersCheck = await checkSecurityHeaders(target);
  const vulns = generateVulnerabilities(Math.floor(Math.random() * 5) + 1);

  const score = calculateSecurityScore(portScan, sslCheck, headersCheck, vulns);

  return {
    target,
    score,
    port_scan: portScan,
    ssl_check: sslCheck,
    headers_check: headersCheck,
    vulnerabilities: vulns,
    timestamp: new Date().toISOString()
  };
}

// Generar recomendaciones basadas en hallazgos
function generateRecommendations(scanResults) {
  const recommendations = [];

  if (scanResults.port_scan.length > 5) {
    recommendations.push({
      priority: 'high',
      title: 'Reducir superficie de ataque',
      description: `Se detectaron ${scanResults.port_scan.length} puertos abiertos. Cierre los puertos no necesarios.`,
      action: 'Revisar reglas de firewall'
    });
  }

  if (scanResults.ssl_check.score < 80) {
    recommendations.push({
      priority: 'high',
      title: 'Actualizar configuración SSL/TLS',
      description: 'La configuración SSL tiene debilidades. Deshabilite TLS 1.0 y 1.1.',
      action: 'Configurar solo TLS 1.2+'
    });
  }

  if (scanResults.headers_check.missing.length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Implementar headers de seguridad',
      description: `Faltan headers: ${scanResults.headers_check.missing.join(', ')}`,
      action: 'Agregar headers en configuración del servidor'
    });
  }

  scanResults.vulnerabilities.forEach(v => {
    if (v.severity === 'critical' || v.severity === 'high') {
      recommendations.push({
        priority: v.severity,
        title: `Corregir ${v.name}`,
        description: v.description,
        action: v.remediation
      });
    }
  });

  return recommendations;
}

function getServiceName(port) {
  const services = {
    21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
    80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS',
    993: 'IMAPS', 995: 'POP3S', 3306: 'MySQL', 3389: 'RDP',
    5432: 'PostgreSQL', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt'
  };
  return services[port] || 'Unknown';
}

module.exports = {
  runScan,
  scanPorts,
  checkSSL,
  checkSecurityHeaders,
  generateVulnerabilities,
  generateRecommendations,
  calculateSecurityScore
};

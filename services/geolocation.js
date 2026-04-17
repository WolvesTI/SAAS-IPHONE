// Servicio de geolocalización para EngineerGo

// Generar profesionales de ejemplo con coordenadas
function generateMockProfessionals(centerLat, centerLng, count = 20) {
  const skills = ['React', 'Node.js', 'Python', 'DevOps', 'AWS', 'Azure', 'Docker', 'Kubernetes', 'AWS', 'Cybersecurity', 'Network', 'Support'];
  const names = ['Carlos', 'María', 'Juan', 'Ana', 'Pedro', 'Laura', 'Diego', 'Sofía', 'Luis', 'Carmen', 'Miguel', 'Elena'];
  const lastNames = ['García', 'Martínez', 'López', 'Hernández', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Torres'];

  const professionals = [];

  for (let i = 0; i < count; i++) {
    // Generar coordenadas aleatorias dentro de un radio de 10km
    const lat = centerLat + (Math.random() - 0.5) * 0.18;
    const lng = centerLng + (Math.random() - 0.5) * 0.18;

    const randomSkills = [];
    const numSkills = Math.floor(Math.random() * 4) + 2;
    for (let j = 0; j < numSkills; j++) {
      const skill = skills[Math.floor(Math.random() * skills.length)];
      if (!randomSkills.includes(skill)) randomSkills.push(skill);
    }

    professionals.push({
      id: i + 1,
      name: `${names[Math.floor(Math.random() * names.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      skills: randomSkills,
      hourly_rate: Math.floor(Math.random() * 50) + 30, // $30-80/h
      rating: (Math.random() * 2 + 3).toFixed(1), // 3.0-5.0
      reviews: Math.floor(Math.random() * 100) + 5,
      lat,
      lng,
      is_available: Math.random() > 0.2, // 80% disponible
      distance: calculateDistance(centerLat, centerLng, lat, lng)
    });
  }

  // Ordenar por distancia
  return professionals.sort((a, b) => a.distance - b.distance);
}

// Calcular distancia entre dos coordenadas (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// Encontrar profesionales cercanos
function findNearbyProfessionals(lat, lng, serviceType = null, maxDistance = 10) {
  const professionals = generateMockProfessionals(lat, lng, 20);

  // Filtrar por tipo de servicio si se especifica
  let filtered = professionals;
  if (serviceType) {
    const serviceKeywords = {
      'software': ['React', 'Node.js', 'Python', 'JavaScript', 'TypeScript'],
      'support': ['Support', 'Network', 'Help Desk', 'IT Support'],
      'devops': ['DevOps', 'AWS', 'Azure', 'Docker', 'Kubernetes'],
      'security': ['Cybersecurity', 'Security', 'Penetration Testing']
    };

    const keywords = serviceKeywords[serviceType] || [serviceType];
    filtered = professionals.filter(p =>
      p.skills.some(skill =>
        keywords.some(k => skill.toLowerCase().includes(k.toLowerCase()))
      )
    );
  }

  // Filtrar por distancia máxima
  return filtered.filter(p => p.distance <= maxDistance);
}

// Calcular tiempo estimado de llegada (simulado)
function calculateETA(distanceKm) {
  // Asumir velocidad promedio de 30km/h en ciudad
  const minutes = Math.ceil((distanceKm / 30) * 60);
  return minutes;
}

// Calcular precio estimado
function calculateEstimatedPrice(hourlyRate, estimatedHours = 2) {
  return {
    hourly_rate: hourlyRate,
    estimated_hours: estimatedHours,
    subtotal: hourlyRate * estimatedHours,
    platform_fee: Math.round(hourlyRate * estimatedHours * 0.1),
    total: Math.round(hourlyRate * estimatedHours * 1.1)
  };
}

module.exports = {
  generateMockProfessionals,
  findNearbyProfessionals,
  calculateDistance,
  calculateETA,
  calculateEstimatedPrice
};

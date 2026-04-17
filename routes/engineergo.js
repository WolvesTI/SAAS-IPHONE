const express = require('express');
const { query, run, get } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { findNearbyProfessionals, calculateETA, calculateEstimatedPrice } = require('../services/geolocation');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// GET /api/engineergo/professionals - Lista de profesionales
router.get('/professionals', async (req, res) => {
  try {
    const { service, min_rating, max_price } = req.query;

    let sql = 'SELECT * FROM eg_professionals WHERE is_available = 1';
    const params = [];

    if (min_rating) {
      sql += ' AND rating >= ?';
      params.push(min_rating);
    }

    if (max_price) {
      sql += ' AND hourly_rate <= ?';
      params.push(max_price);
    }

    sql += ' ORDER BY rating DESC';

    const professionals = await query(sql, params);

    // Si se especificó servicio, filtrar por skills
    let filtered = professionals;
    if (service) {
      const serviceKeywords = {
        'software': ['React', 'Node.js', 'Python', 'JavaScript', 'TypeScript', 'Developer'],
        'support': ['Support', 'Network', 'Help Desk', 'IT Support'],
        'devops': ['DevOps', 'AWS', 'Azure', 'Docker', 'Kubernetes'],
        'security': ['Cybersecurity', 'Security', 'Penetration Testing']
      };
      const keywords = serviceKeywords[service] || [service];

      filtered = professionals.filter(p => {
        const skills = JSON.parse(p.skills || '[]');
        return skills.some(skill =>
          keywords.some(k => skill.toLowerCase().includes(k.toLowerCase()))
        );
      });
    }

    res.json({
      professionals: filtered.map(p => ({
        ...p,
        skills: JSON.parse(p.skills || '[]')
      }))
    });
  } catch (error) {
    console.error('Error al obtener profesionales:', error);
    res.status(500).json({ error: 'Error al obtener profesionales' });
  }
});

// GET /api/engineergo/professionals/nearby - Profesionales cercanos
router.get('/professionals/nearby', async (req, res) => {
  try {
    const { lat, lng, service, max_distance = 10 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitud y longitud requeridas' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    // Buscar en base de datos primero
    const dbPros = await query(`
      SELECT * FROM eg_professionals WHERE is_available = 1
    `);

    let professionals = dbPros.map(p => ({
      ...p,
      skills: JSON.parse(p.skills || '[]'),
      distance: calculateDistance(latitude, longitude, p.lat, p.lng)
    })).filter(p => p.distance <= max_distance);

    // Si hay pocos resultados, generar mock data
    if (professionals.length < 5) {
      const mockPros = findNearbyProfessionals(latitude, longitude, service, max_distance);

      // Insertar profesionales mock en BD para persistencia
      for (const pro of mockPros.slice(0, 10)) {
        const existing = await get('SELECT id FROM eg_professionals WHERE email = ?', [pro.email || `${pro.id}@mock.com`]);
        if (!existing) {
          await run(
            'INSERT INTO eg_professionals (name, email, skills, hourly_rate, rating, lat, lng, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              pro.name,
              `${Date.now()}_${pro.id}@mock.com`,
              JSON.stringify(pro.skills),
              pro.hourly_rate,
              pro.rating,
              pro.lat,
              pro.lng,
              pro.is_available ? 1 : 0
            ]
          );
        }
      }

      // Recargar desde BD
      professionals = await query(`
        SELECT * FROM eg_professionals WHERE is_available = 1
      `);

      professionals = professionals.map(p => ({
        ...p,
        skills: JSON.parse(p.skills || '[]'),
        distance: calculateDistance(latitude, longitude, p.lat, p.lng)
      })).filter(p => p.distance <= max_distance)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);
    }

    // Agregar ETA a cada profesional
    const prosWithETA = professionals.map(p => ({
      ...p,
      eta_minutes: calculateETA(p.distance),
      estimated_price: calculateEstimatedPrice(p.hourly_rate)
    }));

    res.json({
      professionals: prosWithETA,
      search_location: { lat: latitude, lng: longitude }
    });
  } catch (error) {
    console.error('Error al buscar profesionales cercanos:', error);
    res.status(500).json({ error: 'Error al buscar profesionales cercanos' });
  }
});

// GET /api/engineergo/professionals/:id - Perfil de profesional
router.get('/professionals/:id', async (req, res) => {
  try {
    const professional = await get(`
      SELECT * FROM eg_professionals WHERE id = ?
    `, [req.params.id]);

    if (!professional) {
      return res.status(404).json({ error: 'Profesional no encontrado' });
    }

    // Obtener reviews del profesional
    const reviews = await query(`
      SELECT r.*, b.client_id
      FROM eg_reviews r
      JOIN eg_bookings b ON r.booking_id = b.id
      WHERE b.professional_id = ?
      ORDER BY r.created_at DESC
    `, [req.params.id]);

    res.json({
      professional: {
        ...professional,
        skills: JSON.parse(professional.skills || '[]'),
        reviews
      }
    });
  } catch (error) {
    console.error('Error al obtener profesional:', error);
    res.status(500).json({ error: 'Error al obtener profesional' });
  }
});

// POST /api/engineergo/bookings - Crear solicitud de servicio
router.post('/bookings', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { professional_id, service_type, notes, client_lat, client_lng } = req.body;

    if (!professional_id || !service_type) {
      return res.status(400).json({ error: 'Profesional y tipo de servicio requeridos' });
    }

    // Obtener información del profesional
    const professional = await get(
      'SELECT hourly_rate FROM eg_professionals WHERE id = ?',
      [professional_id]
    );

    if (!professional) {
      return res.status(404).json({ error: 'Profesional no encontrado' });
    }

    // Crear booking
    const result = await run(
      'INSERT INTO eg_bookings (client_id, professional_id, service_type, status, price, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, professional_id, service_type, 'pending', professional.hourly_rate * 2, notes]
    );

    const booking = await get('SELECT * FROM eg_bookings WHERE id = ?', [result.id]);

    res.status(201).json({
      message: 'Solicitud creada exitosamente',
      booking
    });
  } catch (error) {
    console.error('Error al crear booking:', error);
    res.status(500).json({ error: 'Error al crear solicitud' });
  }
});

// GET /api/engineergo/bookings - Mis bookings
router.get('/bookings', async (req, res) => {
  try {
    const userId = req.user.id;

    const bookings = await query(`
      SELECT b.*, p.name as professional_name, p.email as professional_email
      FROM eg_bookings b
      JOIN eg_professionals p ON b.professional_id = p.id
      WHERE b.client_id = ?
      ORDER BY b.created_at DESC
    `, [userId]);

    res.json({ bookings });
  } catch (error) {
    console.error('Error al obtener bookings:', error);
    res.status(500).json({ error: 'Error al obtener bookings' });
  }
});

// GET /api/engineergo/bookings/:id - Detalle de booking
router.get('/bookings/:id', async (req, res) => {
  try {
    const userId = req.user.id;

    const booking = await get(`
      SELECT b.*, p.name as professional_name, p.email as professional_email, p.phone
      FROM eg_bookings b
      JOIN eg_professionals p ON b.professional_id = p.id
      WHERE b.id = ? AND b.client_id = ?
    `, [req.params.id, userId]);

    if (!booking) {
      return res.status(404).json({ error: 'Booking no encontrado' });
    }

    // Obtener información de pago
    const payment = await get(
      'SELECT * FROM eg_payments WHERE booking_id = ?',
      [req.params.id]
    );

    res.json({ booking, payment });
  } catch (error) {
    console.error('Error al obtener booking:', error);
    res.status(500).json({ error: 'Error al obtener booking' });
  }
});

// PATCH /api/engineergo/bookings/:id - Actualizar estado
router.patch('/bookings/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.body;

    await run(
      'UPDATE eg_bookings SET status = ? WHERE id = ? AND client_id = ?',
      [status, req.params.id, userId]
    );

    res.json({ message: 'Booking actualizado' });
  } catch (error) {
    console.error('Error al actualizar booking:', error);
    res.status(500).json({ error: 'Error al actualizar booking' });
  }
});

// POST /api/engineergo/payments - Procesar pago
router.post('/payments', async (req, res) => {
  try {
    const { booking_id, method } = req.body;

    const booking = await get('SELECT * FROM eg_bookings WHERE id = ?', [booking_id]);

    if (!booking) {
      return res.status(404).json({ error: 'Booking no encontrado' });
    }

    // Crear registro de pago
    const result = await run(
      'INSERT INTO eg_payments (booking_id, amount, status, method) VALUES (?, ?, ?, ?)',
      [booking_id, booking.price, 'completed', method]
    );

    // Actualizar estado del booking
    await run(
      "UPDATE eg_bookings SET status = 'confirmed' WHERE id = ?",
      [booking_id]
    );

    const payment = await get('SELECT * FROM eg_payments WHERE id = ?', [result.id]);

    res.json({
      message: 'Pago procesado exitosamente',
      payment
    });
  } catch (error) {
    console.error('Error al procesar pago:', error);
    res.status(500).json({ error: 'Error al procesar pago' });
  }
});

// POST /api/engineergo/reviews - Agregar review
router.post('/reviews', async (req, res) => {
  try {
    const { booking_id, rating, comment } = req.body;

    const booking = await get(
      'SELECT * FROM eg_bookings WHERE id = ? AND client_id = ?',
      [booking_id, req.user.id]
    );

    if (!booking) {
      return res.status(404).json({ error: 'Booking no encontrado' });
    }

    const result = await run(
      'INSERT INTO eg_reviews (booking_id, rating, comment) VALUES (?, ?, ?)',
      [booking_id, rating, comment]
    );

    // Actualizar rating del profesional
    const avgRating = await get(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count
      FROM eg_reviews r
      JOIN eg_bookings b ON r.booking_id = b.id
      WHERE b.professional_id = ?
    `, [booking.professional_id]);

    await run(
      'UPDATE eg_professionals SET rating = ? WHERE id = ?',
      [avgRating.avg_rating.toFixed(1), booking.professional_id]
    );

    res.json({ message: 'Review agregada exitosamente' });
  } catch (error) {
    console.error('Error al agregar review:', error);
    res.status(500).json({ error: 'Error al agregar review' });
  }
});

// GET /api/engineergo/user/profile - Perfil del usuario
router.get('/user/profile', async (req, res) => {
  try {
    const user = await get(
      'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    // Contar bookings
    const bookingCount = await get(
      'SELECT COUNT(*) as count FROM eg_bookings WHERE client_id = ?',
      [req.user.id]
    );

    res.json({
      user,
      stats: {
        total_bookings: bookingCount.count
      }
    });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

// Helper para calcular distancia
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
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

module.exports = router;

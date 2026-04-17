const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get } = require('../database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role = 'user' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password y name son requeridos' });
    }

    // Verificar si el email ya existe
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    // Hashear password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const result = await run(
      'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, name, role]
    );

    const user = await get('SELECT id, email, name, role FROM users WHERE id = ?', [result.id]);
    const token = generateToken(user);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user,
      token
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    // Buscar usuario
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token
    const token = generateToken(user);

    res.json({
      message: 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// GET /api/auth/me (obtener usuario actual)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, email, name, role FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

module.exports = router;

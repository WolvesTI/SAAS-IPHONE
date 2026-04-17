// API Client para iSecure Audit
const API_BASE_URL = 'http://localhost:3001/api';

// Token storage
const getToken = () => localStorage.getItem('is_token');
const setToken = (token) => localStorage.setItem('is_token', token);
const removeToken = () => localStorage.removeItem('is_token');

// Helper para hacer requests
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error en la solicitud');
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth API
const authAPI = {
  login: async (email, password) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      setToken(data.token);
      localStorage.setItem('is_user', JSON.stringify(data.user));
    }
    return data;
  },

  register: async (email, password, name) => {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    if (data.token) {
      setToken(data.token);
      localStorage.setItem('is_user', JSON.stringify(data.user));
    }
    return data;
  },

  logout: () => {
    removeToken();
    localStorage.removeItem('is_user');
  },

  getUser: () => {
    const user = localStorage.getItem('is_user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => !!getToken()
};

// iSecure Audit API
const isecureAPI = {
  createAudit: (auditData) => apiRequest('/isecure/audits', {
    method: 'POST',
    body: JSON.stringify(auditData)
  }),

  getAudits: () => apiRequest('/isecure/audits'),

  getAudit: (id) => apiRequest(`/isecure/audits/${id}`),

  updateAudit: (id, auditData) => apiRequest(`/isecure/audits/${id}`, {
    method: 'PUT',
    body: JSON.stringify(auditData)
  }),

  deleteAudit: (id) => apiRequest(`/isecure/audits/${id}`, {
    method: 'DELETE'
  }),

  exportReport: (auditId, format = 'json') => apiRequest(`/isecure/audits/${auditId}/export`, {
    method: 'POST',
    body: JSON.stringify({ format })
  }),

  getReports: () => apiRequest('/isecure/reports'),

  getBenchmarks: () => apiRequest('/isecure/benchmarks'),

  getChecks: () => apiRequest('/isecure/checks')
};

// Exportar APIs
window.ISecureAPI = { auth: authAPI, isecure: isecureAPI };

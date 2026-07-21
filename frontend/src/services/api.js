import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  resetPassword: (id, password) => api.put(`/auth/users/${id}/password`, { password }),
  deactivateUser: (id) => api.delete(`/auth/users/${id}`),
};

// Inventory
export const inventoryAPI = {
  getAll: (params) => api.get('/inventory', { params }),
  getStats: () => api.get('/inventory/summary/stats'),
  createCoil: (data) => api.post('/inventory/coils', data),
  createSheet: (data) => api.post('/inventory/sheets', data),
  updateCoil: (id, data) => api.put(`/inventory/coils/${id}`, data),
  updateSheet: (id, data) => api.put(`/inventory/sheets/${id}`, data),
  deleteCoil: (id) => api.delete(`/inventory/coils/${id}`),
  deleteSheet: (id) => api.delete(`/inventory/sheets/${id}`),
  getCoil: (id) => api.get(`/inventory/coils/${id}`),
  getSheet: (id) => api.get(`/inventory/sheets/${id}`),
  moveCoil: (id, data) => api.post(`/inventory/coils/${id}/movements`, data),
  moveSheet: (id, data) => api.post(`/inventory/sheets/${id}/movements`, data),
};

// Machines
export const machinesAPI = {
  getAll: (active) => api.get('/machines', { params: active ? { active: 'true' } : {} }),
  getById: (id) => api.get(`/machines/${id}`),
  create: (data) => api.post('/machines', data),
  update: (id, data) => api.put(`/machines/${id}`, data),
  toggle: (id) => api.patch(`/machines/${id}/toggle`),
};

// Customers
export const customersAPI = {
  getAll: () => api.get('/customers'),
  getById: (id) => api.get(`/customers/${id}`),
  getOrders: (id) => api.get(`/customers/${id}/orders`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
};

// Orders
export const ordersAPI = {
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  addShipment: (id, data) => api.post(`/orders/${id}/shipments`, data),
  cancel: (id) => api.patch(`/orders/${id}/cancel`),
  delete: (id) => api.delete(`/orders/${id}`),
};

// Suppliers
export const suppliersAPI = {
  getAll: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
};

// Optimization
export const optimizationAPI = {
  run: (data) => api.post('/optimization/run', data),
  confirm: (data) => api.post('/optimization/confirm', data),
  getJobs: (params) => api.get('/optimization/jobs', { params }),
  updateJobStatus: (id, status) => api.patch(`/optimization/jobs/${id}/status`, { status }),
};

// Production
export const productionAPI = {
  getPlan: (date) => api.get('/production/plan', { params: { date } }),
  getJobs: (params) => api.get('/production/jobs', { params }),
  updateJob: (id, data) => api.patch(`/production/jobs/${id}`, data),
  logJob: (data) => api.post('/production/jobs', data),
};

// Scrap
export const scrapAPI = {
  getAll: () => api.get('/scrap'),
  getSummary: () => api.get('/scrap/summary'),
};

// Settings
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

// Stats
export const statsAPI = {
  get: () => api.get('/stats'),
};

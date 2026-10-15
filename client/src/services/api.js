import axios from 'axios';

// In production (Vercel), point API calls to the deployed Flask backend.
// Set REACT_APP_API_BASE_URL in Vercel environment variables.
const BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const resolvedBase = BASE_URL || window.location.origin;
  const resolvedUrl = config.url?.startsWith('http')
    ? config.url
    : resolvedBase + (config.url || '');

  let isOwnApi = false;
  try {
    const url = new URL(resolvedUrl);
    isOwnApi = url.pathname.startsWith('/api/');
  } catch (_) {
    isOwnApi = (config.url || '').startsWith('/api/');
  }

  config.headers = config.headers || {};
  // Remove any inherited Authorization header before deciding where it belongs.
  for (const headers of [config.headers, config.headers.common]) {
    if (headers) {
      Object.keys(headers).forEach((name) => {
        if (name.toLowerCase() === 'authorization') delete headers[name];
      });
    }
  }
  const token = localStorage.getItem('mrs_token');
  if (isOwnApi && token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

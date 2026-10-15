import axios from 'axios';

// Keep authentication on same-origin API requests, never OMDb or other hosts.
const api = axios.create();
api.interceptors.request.use((config) => {
  const url = new URL(config.url, window.location.origin);
  const isOwnApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
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

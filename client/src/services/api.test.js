import api from './api';

beforeEach(() => localStorage.clear());

const capture = async (url, headers) => {
  const response = await api.get(url, {
    headers,
    adapter: (config) => Promise.resolve({ data: config, status: 200, statusText: 'OK', headers: {}, config }),
  });
  return response.data;
};

test('sends JWT only to the same-origin API', async () => {
  localStorage.setItem('mrs_token', 'private-token');
  expect((await capture('/api/auth/me')).headers.Authorization).toBe('Bearer private-token');
  for (const url of ['https://www.omdbapi.com/?t=Inception', '//external.example/api/users', '/images/test.png']) {
    expect((await capture(url, { Authorization: 'must-be-removed' })).headers.Authorization).toBeUndefined();
  }
});

test('logout removes authorization on subsequent requests', async () => {
  localStorage.setItem('mrs_token', 'private-token');
  expect((await capture('/api/user/watchlist')).headers.Authorization).toBe('Bearer private-token');
  localStorage.removeItem('mrs_token');
  expect((await capture('/api/user/watchlist')).headers.Authorization).toBeUndefined();
});

import httpClient from './httpClient';

export const register = async (payload) => {
  const { data } = await httpClient.post('/api/auth/register', payload);
  return data;
};

export const login = async (payload) => {
  const { data } = await httpClient.post('/api/auth/login', payload);
  return data;
};

export const logout = async () => {
  await httpClient.post('/api/auth/logout');
};

export const me = async () => {
  const { data } = await httpClient.get('/api/auth/me');
  return data;
};

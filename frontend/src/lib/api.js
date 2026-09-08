import axios from 'axios';
import { API_BASE_URL } from '../config';

export const AUTH_TOKEN_KEY = 'apnibus.authToken';

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

const api = axios.create({
  baseURL: API_BASE_URL
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;

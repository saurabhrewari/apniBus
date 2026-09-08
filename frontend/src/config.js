const defaultApiBaseUrl = import.meta.env.PROD
  ? window.location.origin
  : 'http://localhost:5001';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl;

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || API_BASE_URL;

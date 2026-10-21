import axios, { AxiosError } from 'axios';
import { supabase } from '../lib/supabase';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api',
  // Increased timeout to 60s to survive Render's free-tier cold starts
  timeout: 60_000, 
  headers: { 'Content-Type': 'application/json' },
});

// Attach Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Handle errors — specifically Render's cold start 502/503/504
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as any;

    // ── Render Cold Start Retry ──
    // If the backend is asleep, Render's proxy throws a 502/503/504.
    // We wait 5 seconds and retry the request up to 2 times before failing.
    if (
      (status === 502 || status === 503 || status === 504) &&
      originalRequest &&
      !originalRequest._retryCount
    ) {
      originalRequest._retryCount = 1;
      console.warn(`Backend is waking up (Status ${status}). Retrying in 5s...`);
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return api(originalRequest);
    }

    if (
      (status === 502 || status === 503 || status === 504) &&
      originalRequest &&
      originalRequest._retryCount < 3
    ) {
      originalRequest._retryCount += 1;
      console.warn(`Backend still waking up (Status ${status}). Retry ${originalRequest._retryCount}/3...`);
      
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return api(originalRequest);
    }

    // ── 401 Session Expired ──
    if (status === 401) {
      await supabase.auth.signOut();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
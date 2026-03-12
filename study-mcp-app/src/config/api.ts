import { supabase } from '../lib/supabase';

const BASE_URL = 'https://api.hamzaammar.ca/api';

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return `Bearer ${session.access_token}`;
}

async function request<T>(method: string, path: string, body?: any, options?: any): Promise<{ data: T }> {
  const authHeader = await getAuthHeader();
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;

  let url = `${BASE_URL}/${cleanPath}`;

  // Handle query params for GET requests
  if (options?.params) {
    const params = new URLSearchParams(options.params);
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json() as T;
  return { data };
}

export const apiClient = {
  get: <T = any>(path: string, options?: any) => request<T>('GET', path, undefined, options),
  post: <T = any>(path: string, body?: any, options?: any) => request<T>('POST', path, body, options),
  delete: <T = any>(path: string, options?: any) => request<T>('DELETE', path, undefined, options),
  invoke: <T = any>(path: string, method: string, body?: any, options?: any) => request<T>(method, path, body, options),
};

export default apiClient;

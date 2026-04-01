import { supabase } from '../lib/supabase';

const BASE_URL = 'https://api.hamzaammar.ca/api';

async function getAuthHeader(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) throw new Error('Not authenticated');
    return `Bearer ${data.session.access_token}`;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return `Bearer ${session.access_token}`;
}

async function request<T>(method: string, path: string, body?: any, options?: any, isRetry = false): Promise<{ data: T }> {
  const authHeader = await getAuthHeader(isRetry);
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;

  let url = `${BASE_URL}/${cleanPath}`;

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

  // On 401, force-refresh the token and retry once
  if (response.status === 401 && !isRetry) {
    return request<T>(method, path, body, options, true);
  }

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

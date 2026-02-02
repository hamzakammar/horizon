import { supabase } from '../lib/supabase';

export const apiClient = {

  invoke: async (path: string, method: string, body?: any, options: any = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    
    // 1. Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    // 2. ONLY use the function name 'study-logic'. 
    // The path after the slash is the sub-route.
    return await supabase.functions.invoke(`study-logic/${cleanPath}`, {
      method,
      body,
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        ...options.headers,
      },
      ...options,
    });
  },

  get: (path: string, options?: any) => apiClient.invoke(path, 'GET', undefined, options),

  post: (path: string, body?: any, options?: any) => apiClient.invoke(path, 'POST', body, options),

  delete: async <T = any>(path: string, options: any = {}) => {
    // Session Check: Call getSession() immediately before invoke
    const { data: { session } } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke('study-logic', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
        ...options.headers,
      },
      ...options,
      path: path.startsWith('/') ? path : `/${path}`,
    });

    if (error) {
      console.error(`[API] DELETE ${path} failed:`, error);
      throw { name: 'FunctionsHttpError', status: error.status || 500, ...error };
    }

    return { data: data as T };
  },
};

export default apiClient;

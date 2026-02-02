import { supabase } from '../lib/supabase';
import { User } from '../types';

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async isAuthenticated(): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  }

  async getUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Map Supabase user to our local User type
    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || '',
    };
  }

  async handleSignUp(email: string, password: string, name?: string): Promise<{ user: any; session: any }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name }
      }
    });
    if (error) throw new Error(error.message);
    return data;
  }

  // Support for AuthContext's preferred naming
  async signUp(email: string, password: string, name?: string) {
    const result = await this.handleSignUp(email, password, name);
    return {
      user: result.user,
      token: (result as any).session?.access_token
    };
  }

  async handleLogin(email: string, password: string): Promise<{ user: any; session: any }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    this.currentUser = data.user ? {
      id: data.user.id,
      email: data.user.email || '',
      name: data.user.user_metadata?.name || '',
    } : null;
    return data;
  }

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    this.currentUser = null;
  }

  // Placeholders to satisfy AuthContext if it expects them
  async setToken(token: string) { }
  async setUser(user: any) {
    this.currentUser = user;
  }

  listenToAuthChanges(callback?: (session: any) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      if (callback) callback(session);
    });
  }
}

export const authService = AuthService.getInstance();

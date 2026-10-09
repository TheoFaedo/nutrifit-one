import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { supabase } from './supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly sessionState = new BehaviorSubject<Session | null>(null);
  readonly session$ = this.sessionState.asObservable();
  private initialized?: Promise<Session | null>;

  initialize(): Promise<Session | null> {
    if (!this.initialized) {
      this.initialized = supabase.auth.getSession().then(({ data }) => {
        this.sessionState.next(data.session);
        supabase.auth.onAuthStateChange((_event, session) => {
          this.sessionState.next(session);
        });
        return data.session;
      });
    }
    return this.initialized;
  }

  async user(): Promise<User | null> {
    const session = await this.initialize();
    if (!session) {
      return null;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      throw error;
    }
    return data.user;
  }

  async signInWithGoogle(): Promise<void> {
    const redirectTo = new URL('auth/callback', document.baseURI).toString();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    await this.router.navigateByUrl('/login');
  }
}

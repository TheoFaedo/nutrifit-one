import { CacheSession } from '@core/stores/cache-session.service';
import { Service, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { supabase } from './supabase.client';
import { I18nService } from '@core/i18n/i18n.service';

@Service()
export class AuthService {
  private readonly cacheSession = inject(CacheSession);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly sessionState = new BehaviorSubject<Session | null>(null);
  readonly session$ = this.sessionState.asObservable();
  private initialized?: Promise<Session | null>;
  private restoredUserId: string | null = null;

  initialize(): Promise<Session | null> {
    if (!this.initialized) {
      this.initialized = supabase.auth.getSession().then(({ data }) => {
        this.cacheSession.setAccount(data.session?.user.id ?? null);
        this.sessionState.next(data.session);
        if (data.session?.user.id) {
          this.restoredUserId = data.session.user.id;
          void this.i18n.restoreProfile(data.session.user.id).catch(() => undefined);
        }
        supabase.auth.onAuthStateChange((event, session) => {
          this.cacheSession.setAccount(session?.user.id ?? null);
          this.sessionState.next(session);
          if (!session?.user.id) {
            this.restoredUserId = null;
            this.i18n.clearAccount(null);
          } else if (event === 'SIGNED_IN' && this.restoredUserId !== session.user.id) {
            this.restoredUserId = session.user.id;
            void this.i18n.restoreProfile(session.user.id).catch(() => undefined);
          }
        });
        return data.session;
      });
    }
    return this.initialized;
  }

  async user(): Promise<User | null> {
    await this.initialize();
    const session = this.sessionState.value;
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
    this.cacheSession.setAccount(null);
    this.sessionState.next(null);
    this.restoredUserId = null;
    this.i18n.clearAccount(null);
    await this.router.navigateByUrl('/login');
  }
}

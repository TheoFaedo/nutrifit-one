import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { supabase } from '../services/supabase.client';

export const signedInGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    if (!(await auth.user())) {
      return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
    }
    return true;
  } catch {
    return router.createUrlTree(['/login']);
  }
};

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    const user = await auth.user();
    if (!user) {
      return router.createUrlTree(['/login']);
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarded')
      .eq('id', user.id)
      .single();
    if (error) {
      throw error;
    }
    return data.onboarded ? router.createUrlTree(['/journal']) : true;
  } catch {
    return router.createUrlTree(['/login']);
  }
};

export const journalGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    const user = await auth.user();
    if (!user) {
      return router.createUrlTree(['/login']);
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarded')
      .eq('id', user.id)
      .single();
    if (error) {
      throw error;
    }
    return data.onboarded ? true : router.createUrlTree(['/onboarding']);
  } catch {
    return router.createUrlTree(['/login']);
  }
};

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

export const onboardedGuard: CanActivateFn = (_route, state) => {
  validateOnboardingInBackground(state.url);
  return true;
};

async function validateOnboardingInBackground(targetUrl: string): Promise<void> {
  const auth = inject(AuthService);
  const router = inject(Router);
  let redirectUrl: string;

  try {
    const user = await auth.user();
    if (!user) {
      redirectUrl = '/login';
    } else {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', user.id)
        .single();
      if (error) {
        throw error;
      }
      redirectUrl = data.onboarded ? targetUrl : '/onboarding';
    }
  } catch {
    redirectUrl = '/login';
  }

  if (redirectUrl !== targetUrl && router.url === targetUrl) {
    await router.navigateByUrl(redirectUrl);
  }
}

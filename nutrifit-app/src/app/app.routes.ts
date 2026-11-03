import { Routes } from '@angular/router';
import {
  signedInGuard,
  onboardingGuard,
  onboardedGuard,
  oauthConsentGuard,
} from '@core/guards/auth.guards';

export const routes: Routes = [
  {
    path: 'oauth/consent',
    loadComponent: () =>
      import('@feature/oauth/consent/consent.component').then((m) => m.ConsentComponent),
    canActivate: [oauthConsentGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('@feature/auth/login/login.component').then((feature) => feature.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('@feature/auth/auth-callback/auth-callback.component').then(
        (feature) => feature.AuthCallbackComponent,
      ),
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('@feature/onboarding/onboarding.component').then(
        (feature) => feature.OnboardingComponent,
      ),
    canActivate: [signedInGuard, onboardingGuard],
  },
  {
    path: 'journal',
    loadComponent: () =>
      import('@feature/journal/journal.component').then((feature) => feature.JournalComponent),
    canActivate: [onboardedGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('@feature/profile/profile.component').then((feature) => feature.ProfileComponent),
    canActivate: [onboardedGuard],
  },
  {
    path: 'meal',
    loadComponent: () =>
      import('@feature/meal/meal.component').then((feature) => feature.MealComponent),
    canActivate: [onboardedGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'journal' },
  { path: '**', redirectTo: 'journal' },
];

import { Routes } from '@angular/router';
import { signedInGuard, onboardingGuard, journalGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./feature/auth/login.component').then((feature) => feature.LoginComponent) },
  { path: 'auth/callback', loadComponent: () => import('./feature/auth/auth-callback.component').then((feature) => feature.AuthCallbackComponent) },
  {
    path: 'onboarding',
    loadComponent: () => import('./feature/onboarding/onboarding.component').then((feature) => feature.OnboardingComponent),
    canActivate: [signedInGuard, onboardingGuard],
  },
  {
    path: 'journal',
    loadComponent: () => import('./feature/journal/journal.component').then((feature) => feature.JournalComponent),
    canActivate: [journalGuard],
  },
  { path: '', pathMatch: 'full', redirectTo: 'journal' },
  { path: '**', redirectTo: 'journal' },
];

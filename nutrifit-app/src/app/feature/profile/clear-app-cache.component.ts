import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-clear-app-cache',
  templateUrl: './clear-app-cache.component.html',
  styleUrl: './clear-app-cache.component.less',
})
export class ClearAppCacheComponent {
  readonly clearing = signal(false);
  readonly error = signal('');

  async clearCache(): Promise<void> {
    if (this.clearing()) {
      return;
    }

    this.clearing.set(true);
    this.error.set('');

    try {
      if ('caches' in globalThis) {
        const cacheNames = (await caches.keys()).filter((cacheName) => cacheName.startsWith('ngsw:'));
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const appPath = window.location.pathname;
        const appRegistrations = registrations.filter((registration) => {
          const scope = new URL(registration.scope);
          return (
            scope.origin === window.location.origin && appPath.startsWith(scope.pathname)
          );
        });
        await Promise.all(appRegistrations.map((registration) => registration.unregister()));
      }

      window.location.reload();
    } catch {
      this.error.set('The app cache could not be cleared. Please try again.');
      this.clearing.set(false);
    }
  }
}

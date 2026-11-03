import { Service } from '@angular/core';

/** Router destinations are relative to Angular's base href, including Pages. */
export function safeReturnUrl(value: string | null): string {
  if (!value || /[\\\s#]/.test(value)) {
    return '/journal';
  }
  const [path] = value.split('?');
  if (path === '/oauth/consent') {
    const params = new URLSearchParams(value.split('?')[1]);
    const id = params.get('authorization_id');
    if (id && /^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
      return `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;
    }
  }
  return ['/journal', '/profile', '/meal'].includes(value) ? value : '/journal';
}

@Service()
export class AuthReturnService {
  private readonly key = 'nutrifit.auth-return';

  remember(value: string | null): void {
    sessionStorage.setItem(this.key, safeReturnUrl(value));
  }

  destination(): string {
    return safeReturnUrl(sessionStorage.getItem(this.key));
  }

  complete(): string {
    const destination = this.destination();
    sessionStorage.removeItem(this.key);
    return destination;
  }
}

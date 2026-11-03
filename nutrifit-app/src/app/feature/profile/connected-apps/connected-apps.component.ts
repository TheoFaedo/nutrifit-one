import { Component, inject, signal } from '@angular/core';
import type { OAuthGrant } from '@supabase/supabase-js';
import { I18nService } from '@core/i18n/i18n.service';
import { OAuthService } from '@core/services/oauth.service';

@Component({
  selector: 'app-connected-apps',
  templateUrl: './connected-apps.component.html',
  styleUrl: './connected-apps.component.less',
})
export class ConnectedAppsComponent {
  readonly i18n = inject(I18nService);
  private readonly oauth = inject(OAuthService);
  readonly grants = signal<OAuthGrant[]>([]);
  readonly loading = signal(true);
  readonly revoking = signal<string | null>(null);
  readonly revoked = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.grants.set(await this.oauth.grants());
    } catch {
      this.error.set(this.i18n.t('oauth', 'loadFailed'));
    } finally {
      this.loading.set(false);
    }
  }

  async revoke(id: string): Promise<void> {
    if (this.revoking()) {
      return;
    }
    this.revoking.set(id);
    this.error.set('');
    this.revoked.set(false);
    try {
      await this.oauth.revoke(id);
      this.grants.update((grants) => grants.filter((grant) => grant.client.id !== id));
      this.revoked.set(true);
    } catch {
      this.error.set(this.i18n.t('oauth', 'revokeFailed'));
    } finally {
      this.revoking.set(null);
    }
  }
}

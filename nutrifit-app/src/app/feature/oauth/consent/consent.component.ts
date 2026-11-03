import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { I18nService } from '@core/i18n/i18n.service';
import { AuthReturnService } from '@core/services/auth-return.service';
import { OAuthService, followOAuthRedirect } from '@core/services/oauth.service';
import { BrandComponent } from '@shared/ui/brand/brand.component';

@Component({
  selector: 'app-consent',
  imports: [BrandComponent, RouterLink],
  templateUrl: './consent.component.html',
  styleUrl: './consent.component.less',
})
export class ConsentComponent {
  readonly i18n = inject(I18nService);
  private readonly oauth = inject(OAuthService);
  private readonly authReturn = inject(AuthReturnService);
  private readonly id = inject(ActivatedRoute).snapshot.queryParamMap.get('authorization_id');
  readonly details = signal<OAuthAuthorizationDetails | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      if (!this.id || !/^[a-zA-Z0-9_-]{1,200}$/.test(this.id)) {
        throw new Error('Invalid request');
      }
      const data = await this.oauth.details(this.id);
      if ('authorization_id' in data) {
        this.details.set(data);
      } else {
        this.authReturn.complete();
        followOAuthRedirect(data.redirect_url);
      }
    } catch {
      this.error.set(this.i18n.t('oauth', 'invalid'));
    } finally {
      this.loading.set(false);
    }
  }

  async decide(approve: boolean): Promise<void> {
    if (!this.id || !this.details() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const redirect = await this.oauth.decide(this.id, approve);
      this.authReturn.complete();
      followOAuthRedirect(redirect);
    } catch {
      this.error.set(this.i18n.t('oauth', 'invalid'));
      this.busy.set(false);
    }
  }
}

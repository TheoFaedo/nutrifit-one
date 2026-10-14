import { Component, inject, signal } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { supabaseConfigured } from '@core/services/supabase.client';
import { BrandComponent } from '@shared/ui/brand/brand.component';
import { LanguageSwitchComponent } from '@shared/ui/language-switch/language-switch.component';
import { I18nService } from '@core/i18n/i18n.service';

@Component({
  selector: 'app-login-page',
  imports: [BrandComponent, LanguageSwitchComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.less',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly configured = signal(supabaseConfigured);
  readonly busy = signal(false);
  readonly error = signal('');

  async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.i18n.t('login', 'signInError'));
      this.busy.set(false);
    }
  }
}

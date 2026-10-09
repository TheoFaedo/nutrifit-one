import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { supabaseConfigured } from '../../core/services/supabase.client';
import { BrandComponent } from '../../shared/ui/brand/brand.component';

@Component({
  selector: 'app-login-page',
  imports: [BrandComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.less',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly configured = signal(supabaseConfigured);
  readonly busy = signal(false);
  readonly error = signal('');

  async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Google sign-in could not start. Please try again.',
      );
      this.busy.set(false);
    }
  }
}

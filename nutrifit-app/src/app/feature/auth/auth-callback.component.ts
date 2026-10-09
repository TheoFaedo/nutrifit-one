import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { supabase } from '../../core/services/supabase.client';

@Component({
  selector: 'app-auth-callback-page',
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.less',
})
export class AuthCallbackComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  constructor() {
    void this.finish();
  }

  private async finish(): Promise<void> {
    try {
      const user = await this.auth.user();
      if (!user) {
        throw new Error('Authentication was not completed.');
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarded')
        .eq('id', user.id)
        .single();
      if (error) {
        throw error;
      }
      await this.router.navigateByUrl(data.onboarded ? '/journal' : '/onboarding');
    } catch {
      await this.router.navigateByUrl('/login');
    }
  }
}

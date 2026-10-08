import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { BrandComponent } from '../../shared/ui/brand/brand.component';

@Component({
  selector: 'app-journal-page',
  imports: [BrandComponent],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.less',
})
export class JournalComponent {
  private readonly auth = inject(AuthService);

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}

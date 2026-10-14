import { Component, input, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { I18nService } from '@core/i18n/i18n.service';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.less',
})
export class BottomNavComponent {
  readonly i18n = inject(I18nService);
  readonly active = input.required<'journal' | 'meal' | 'profile'>();
}

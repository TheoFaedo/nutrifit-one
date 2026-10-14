import { Component, inject, output } from '@angular/core';
import { I18nService } from '@core/i18n/i18n.service';
import { Language } from '@core/i18n/translations';

@Component({
  selector: 'app-language-switch',
  template: `<label class="language-switch">
    <span>{{ i18n.t('common', 'language') }}</span>
    <select [value]="i18n.language()" [attr.aria-label]="i18n.t('common', 'language')"
      (change)="select($event)">
      <option value="fr">{{ i18n.t('common', 'french') }}</option>
      <option value="en">{{ i18n.t('common', 'english') }}</option>
    </select>
  </label>`,
  styles: `
    :host {
      display: block;
    }
    .language-switch {
      display: flex;
      display: flex;
      align-items: center;
      gap: 8px;
      font: inherit;
      font-size: 12px;
      color: #647063;
    }
    .language-switch select {
      padding: 7px 30px 7px 10px;
      border: 1px solid #dce4d7;
      border-radius: 8px;
      background: #fffefa;
      color: #416b51;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .language-switch select:focus-visible {
      outline: 3px solid #d6a84f;
      outline-offset: 2px;
    }
  `,
})
export class LanguageSwitchComponent {
  readonly i18n = inject(I18nService);
  readonly changed = output<Language>();
  select(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'fr' && value !== 'en') {
      return;
    }
    const language: Language = value;
    this.i18n.setLanguage(language);
    this.changed.emit(language);
  }
}

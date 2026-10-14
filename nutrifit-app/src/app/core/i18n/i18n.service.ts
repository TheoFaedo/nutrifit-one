import { computed, Injectable, signal } from '@angular/core';
import { Language, TranslationDomain, translations } from './translations';

const STORAGE_KEY = 'nutrifit-language';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly language = signal<Language>(localStorage.getItem(STORAGE_KEY) === 'fr' ? 'fr' : 'en');
  readonly locale = computed(() => (this.language() === 'fr' ? 'fr-FR' : 'en-GB'));
  private pending = new Map<string, Promise<void>>();
  private activeUserId: string | null = null;
  private localChanges = 0;

  constructor() {
    this.applyDocumentLanguage(this.language());
  }

  t(domain: TranslationDomain, key: string, values: Record<string, string | number> = {}): string {
    const table: Record<string, string> = translations[this.language()][domain];
    const value = table[key] ?? key;
    return value.replace(/\{(\w+)\}/g, (token, name: string) =>
      String(values[name] ?? token),
    );
  }

  setLanguage(language: Language): void {
    this.localChanges++;
    this.applyLanguage(language);
  }

  async restoreProfile(userId: string): Promise<void> {
    this.activeUserId = userId;
    const changesAtStart = this.localChanges;
    const { supabase } = await import('../services/supabase.client');
    const { data, error } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', userId)
      .single();
    if (error) {
      throw error;
    }
    const changedLocally = this.localChanges !== changesAtStart || this.pending.has(userId);
    if (this.activeUserId === userId && !changedLocally) {
      this.applyLanguage(data.language === 'fr' ? 'fr' : 'en');
    }
  }

  async saveForUser(userId: string, language: Language): Promise<void> {
    this.activeUserId = userId;
    await this.pending.get(userId)?.catch(() => undefined);
    if (this.activeUserId !== userId) {
      return;
    }
    const { supabase } = await import('../services/supabase.client');
    const task = Promise.resolve(
      supabase
        .from('profiles')
        .update({ language })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) {
            throw error;
          }
        }),
    );
    this.pending.set(userId, task);
    try {
      await task;
    } finally {
      if (this.pending.get(userId) === task) {
        this.pending.delete(userId);
      }
    }
  }

  clearAccount(userId: string | null): void {
    if (userId === null || this.activeUserId === userId) {
      this.activeUserId = null;
    }
  }
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale(), options).format(value);
  }
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), options).format(value);
  }

  private applyLanguage(language: Language): void {
    this.language.set(language);
    localStorage.setItem(STORAGE_KEY, language);
    this.applyDocumentLanguage(language);
  }

  private applyDocumentLanguage(language: Language): void {
    document.documentElement.lang = language;
    document.title = language === 'fr'
      ? 'Nutrifit one — votre alimentation, à votre rythme'
      : 'Nutrifit one — your food, your pace';
  }
}

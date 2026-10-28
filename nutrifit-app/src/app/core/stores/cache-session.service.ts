import { Service, signal } from '@angular/core';

/** Session lifecycle owns this registry; stores never depend on authentication. */
@Service()
export class CacheSession {
  private account: string | null = null;
  private readonly resets = new Set<() => void>();
  private readonly epoch = signal(0);
  readonly generation = this.epoch.asReadonly();

  register(reset: () => void): void {
    this.resets.add(reset);
  }
  setAccount(account: string | null): void {
    if (account === this.account) {
      return;
    }
    this.account = account;
    this.epoch.update((value) => value + 1);
    this.resets.forEach((reset) => reset());
  }
}

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

@Component({
  selector: 'app-app-update',
  templateUrl: './app-update.component.html',
  styleUrl: './app-update.component.less',
})
export class AppUpdateComponent {
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);
  readonly updateAvailable = signal(false);
  readonly updating = signal(false);
  readonly error = signal('');

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.updateAvailable.set(true));

    void this.checkForUpdate();
  }

  async applyUpdate(): Promise<void> {
    if (this.updating()) {
      return;
    }

    this.updating.set(true);
    this.error.set('');

    try {
      await this.swUpdate.activateUpdate();
      window.location.reload();
    } catch {
      this.error.set('The update could not be installed. Please try again.');
      this.updating.set(false);
    }
  }

  private async checkForUpdate(): Promise<void> {
    try {
      await this.swUpdate.checkForUpdate();
    } catch {
      // A failed check should not interrupt profile use.
    }
  }
}

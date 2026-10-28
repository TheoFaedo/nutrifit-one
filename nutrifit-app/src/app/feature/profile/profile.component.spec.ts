import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { vi } from 'vitest';
import { AuthService } from '@core/services/auth.service';
import { DailyGoalsService, DailyGoal } from '@core/services/daily-goals.service';
import { DailyGoalsStore, todayParis } from '@core/stores/daily-goals.store';
import { ProfileComponent } from './profile.component';

const initial = { energy_kcal: 2000, carbs_g: 250, fats_g: 70, proteins_g: 100 };

describe('ProfileComponent cache', () => {
  let finish: (goal: DailyGoal | null) => void;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        { provide: SwUpdate, useValue: { isEnabled: false } },
        {
          provide: AuthService,
          useValue: { user: vi.fn().mockResolvedValue({ user_metadata: {} }) },
        },
        {
          provide: DailyGoalsService,
          useValue: {
            forDate: vi.fn(
              () =>
                new Promise<DailyGoal | null>((resolve) => {
                  finish = resolve;
                }),
            ),
          },
        },
      ],
    });
    TestBed.inject(DailyGoalsStore).write(todayParis(), initial);
  });

  it('initializes from cache and preserves dirty fields while updating the saved reference', async () => {
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.form.controls.energy.value).toBe(2000);
    expect(component.loading()).toBe(false);
    expect(component.refreshing()).toBe(true);
    component.form.controls.energy.setValue(2300, { emitEvent: false });
    component.form.markAsDirty();
    finish({ ...initial, energy_kcal: 2100 });
    await fixture.whenStable();
    expect(component.form.controls.energy.value).toBe(2300);
    expect(component.savedTargets()?.energy).toBe(2100);
    component.restoreSavedTargets();
    expect(component.form.controls.energy.value).toBe(2100);
  });

  it('keeps cached targets editable after a failed refresh', async () => {
    const api = TestBed.inject(DailyGoalsService);
    vi.mocked(api.forDate).mockRejectedValueOnce(new Error('offline'));
    const fixture = TestBed.createComponent(ProfileComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance.form.controls.energy.value).toBe(2000);
    expect(fixture.componentInstance.loadError()).toBe('offline');
  });
  it('does not report an obsolete refresh as an error after a confirmed write', async () => {
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    TestBed.inject(DailyGoalsStore).write(todayParis(), { ...initial, energy_kcal: 2300 });
    finish(initial);
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBe('');
    expect(fixture.componentInstance.savedTargets()?.energy).toBe(2300);
  });
});

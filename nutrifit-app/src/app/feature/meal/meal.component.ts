import { Component } from '@angular/core';
import { BrandComponent } from '../../shared/ui/brand/brand.component';
import { BottomNavComponent } from '../../shared/ui/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-meal-page',
  imports: [BrandComponent, BottomNavComponent],
  template: `<main class="setup-shell"><header class="setup-header"><app-brand /><span class="meal-date">Your space</span></header><section class="meal-content"><p class="eyebrow">Meal</p><h1>Make room<br>for the good stuff.</h1><p class="muted">Meal tracking is coming soon. Your daily journal is ready when you are.</p></section></main><app-bottom-nav active="meal" />`,
  styles: [`.meal-content { width: min(100%, 640px); margin: 78px auto; } .meal-content h1 { margin: 0; font-family: Georgia, serif; font-size: clamp(44px, 7vw, 62px); font-weight: 400; line-height: 1; letter-spacing: -.055em; } .meal-content > .muted { max-width: 390px; margin-top: 18px; } .meal-date { color: var(--muted); font-size: 12px; }`],
})
export class MealComponent {}

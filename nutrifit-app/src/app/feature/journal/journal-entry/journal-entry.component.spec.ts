import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { JournalEntryComponent } from '@feature/journal/journal-entry/journal-entry.component';
import { IntakeRecord } from '@core/services/intake-journal.service';

const entry: IntakeRecord = {
  id: 'one',
  brand: null,
  food_name: 'A very long food name',
  food_version_id: 'v1',
  quantity_id: 'p1',
  ratio: 1,
  meal_type: 'LUNCH',
  consumed_at: '2026-10-28T12:00:00Z',
  kind: 'FOOD',
  portion: {
    id: 'p1',
    quantity_number: 100,
    quantity_unit: 'g',
    is_reference: true,
    energy_kcal: 100,
    carbs_g: 10,
    fats_g: 4,
    proteins_g: 6,
  },
};

function pointer(type: string, x: number, y = 0): PointerEvent {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y });
  return event as PointerEvent;
}

describe('JournalEntryComponent', () => {
  async function setup(open = false) {
    const fixture = TestBed.createComponent(JournalEntryComponent);
    fixture.componentRef.setInput('entry', entry);
    fixture.componentRef.setInput('open', open);
    await fixture.whenStable();
    const content = fixture.nativeElement.querySelector('.entry-content') as HTMLElement;
    const opened = vi.fn();
    fixture.componentInstance.openRequested.subscribe(opened);
    return { fixture, content, opened };
  }

  it.each(['.entry-content', '.entry-name strong', '.entry-toggle', '.entry-toggle span'])(
    'follows a swipe starting from %s and opens once without toggling back on click',
    async (selector) => {
      const { fixture, content, opened } = await setup();
      const origin = fixture.nativeElement.querySelector(selector) as HTMLElement;
      origin.dispatchEvent(pointer('pointerdown', 150));
      content.dispatchEvent(pointer('pointermove', 90));
      await fixture.whenStable();
      expect(content.style.transform).toBe('translateX(-60px)');
      expect(opened).not.toHaveBeenCalled();
      content.dispatchEvent(pointer('pointerup', 90));
      fixture.componentRef.setInput('open', true);
      await fixture.whenStable();
      origin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      expect(opened).toHaveBeenCalledOnce();
      expect(opened).toHaveBeenCalledWith(true);
      expect(content.style.transform).toBe('translateX(-112px)');
    },
  );

  it('toggles on successive simple pointer clicks from the button icon', async () => {
    const { fixture, opened } = await setup();
    const icon = fixture.nativeElement.querySelector('.entry-toggle span') as HTMLElement;
    for (const open of [false, true]) {
      fixture.componentRef.setInput('open', open);
      await fixture.whenStable();
      icon.dispatchEvent(pointer('pointerdown', 100));
      icon.dispatchEvent(pointer('pointerup', 100));
      icon.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(opened).toHaveBeenLastCalledWith(!open);
    }
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it('keeps keyboard activation available after a swipe without a follow-up pointer click', async () => {
    const { fixture, content, opened } = await setup();
    content.dispatchEvent(pointer('pointerdown', 100));
    content.dispatchEvent(pointer('pointermove', 60));
    content.dispatchEvent(pointer('pointerup', 60));
    expect(opened).toHaveBeenCalledWith(true);
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    fixture.componentInstance.focusToggle();
    const toggle = fixture.nativeElement.querySelector('.entry-toggle') as HTMLButtonElement;
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    expect(opened).toHaveBeenLastCalledWith(false);
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it('closes with a reverse swipe and retains state for a short swipe', async () => {
    const { content, opened } = await setup(true);
    content.dispatchEvent(pointer('pointerdown', 100));
    content.dispatchEvent(pointer('pointermove', 150));
    content.dispatchEvent(pointer('pointerup', 150));
    expect(opened).toHaveBeenLastCalledWith(false);
    content.dispatchEvent(pointer('pointerdown', 100));
    content.dispatchEvent(pointer('pointermove', 120));
    content.dispatchEvent(pointer('pointerup', 120));
    expect(opened).toHaveBeenLastCalledWith(true);
  });

  it('does not open for insufficient movement or vertical scrolling', async () => {
    const { fixture, content, opened } = await setup();
    content.dispatchEvent(pointer('pointerdown', 100));
    content.dispatchEvent(pointer('pointermove', 70));
    content.dispatchEvent(pointer('pointerup', 70));
    expect(opened).toHaveBeenLastCalledWith(false);
    opened.mockClear();
    content.dispatchEvent(pointer('pointerdown', 100));
    const move = pointer('pointermove', 90, 60);
    content.dispatchEvent(move);
    content.dispatchEvent(pointer('pointerup', 20, 100));
    expect(opened).not.toHaveBeenCalled();
    expect(move.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.dragOffset()).toBeNull();
  });

  it.each([4, 30])(
    'keeps actions closed after a short %ipx drag from the toggle',
    async (distance) => {
      const { fixture, content, opened } = await setup();
      const toggle = fixture.nativeElement.querySelector('.entry-toggle') as HTMLButtonElement;
      toggle.dispatchEvent(pointer('pointerdown', 100));
      content.dispatchEvent(pointer('pointermove', 100 - distance));
      content.dispatchEvent(pointer('pointerup', 100 - distance));
      if (distance >= 8) {
        toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        expect(opened).toHaveBeenCalledExactlyOnceWith(false);
      } else {
        expect(opened).not.toHaveBeenCalled();
      }
      expect(fixture.componentInstance.dragOffset()).toBeNull();
    },
  );

  it.each(['pointercancel', 'lostpointercapture'])(
    'resets an interrupted gesture on %s',
    async (type) => {
      const { fixture, content, opened } = await setup();
      content.dispatchEvent(pointer('pointerdown', 100));
      content.dispatchEvent(pointer('pointermove', 40));
      content.dispatchEvent(pointer(type, 40));
      content.dispatchEvent(pointer('pointerup', 40));
      expect(fixture.componentInstance.dragOffset()).toBeNull();
      expect(opened).not.toHaveBeenCalled();
    },
  );

  it('exposes a named toggle and keeps closed actions inert', async () => {
    const { fixture, opened } = await setup();
    const toggle = fixture.nativeElement.querySelector('.entry-toggle') as HTMLButtonElement;
    const actions = fixture.nativeElement.querySelector('.entry-actions') as HTMLElement;
    expect(toggle.getAttribute('aria-label')).toContain(entry.food_name);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(actions.hasAttribute('inert')).toBe(true);
    toggle.click();
    expect(opened).toHaveBeenCalledWith(true);
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    expect(actions.hasAttribute('inert')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    for (const button of actions.querySelectorAll('button')) {
      expect(button.getAttribute('aria-label')).toContain(entry.food_name);
    }
    const edit = vi.fn();
    const remove = vi.fn();
    fixture.componentInstance.editRequested.subscribe(edit);
    fixture.componentInstance.deleteRequested.subscribe(remove);
    actions.querySelectorAll('button')[0].click();
    actions.querySelectorAll('button')[1].click();
    expect(edit).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});

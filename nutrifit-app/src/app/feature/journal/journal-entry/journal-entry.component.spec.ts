import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { JournalEntryComponent } from '@feature/journal/journal-entry/journal-entry.component';
import { IntakeRecord } from '@core/services/intake-journal.service';

const entry: IntakeRecord = {
  id: 'one',
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

  it('follows the pointer and opens only after a left swipe of 40px', async () => {
    const { fixture, content, opened } = await setup();
    content.dispatchEvent(pointer('pointerdown', 150));
    content.dispatchEvent(pointer('pointermove', 90));
    fixture.detectChanges();
    expect(content.style.transform).toBe('translateX(-60px)');
    expect(opened).not.toHaveBeenCalled();
    content.dispatchEvent(pointer('pointerup', 90));
    expect(opened).toHaveBeenCalledWith(true);
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
    fixture.detectChanges();
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

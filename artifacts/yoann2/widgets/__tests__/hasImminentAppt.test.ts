import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildWidgetData } from '../data';
import { DEFAULT_WIDGET_SETTINGS } from '../widgetSettings';

const BASE_TASKS: never[] = [];

function makeAppt(deltaMins: number) {
  const d = new Date(Date.now() + deltaMins * 60_000);
  return {
    title: 'Test RDV',
    date: d.toISOString().split('T')[0],
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

describe('buildWidgetData › hasImminentAppt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when an appointment starts in < 2 hours', () => {
    const appt = makeAppt(90);
    const data = buildWidgetData(BASE_TASKS, [appt], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(true);
  });

  it('returns true when an appointment starts in exactly 1 minute', () => {
    const appt = makeAppt(1);
    const data = buildWidgetData(BASE_TASKS, [appt], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(true);
  });

  it('returns true when the appointment is exactly 2 hours away (boundary is inclusive: <=)', () => {
    const appt = makeAppt(120);
    const data = buildWidgetData(BASE_TASKS, [appt], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(true);
  });

  it('returns false when the appointment is more than 2 hours away by 1 minute', () => {
    const appt = makeAppt(121);
    const data = buildWidgetData(BASE_TASKS, [appt], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(false);
  });

  it('returns false when the appointment is more than 2 hours away', () => {
    const appt = makeAppt(180);
    const data = buildWidgetData(BASE_TASKS, [appt], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(false);
  });

  it('returns false when the appointment is in the past', () => {
    const appt = makeAppt(-30);
    const data = buildWidgetData(BASE_TASKS, [appt], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(false);
  });

  it('returns false when the appointment has no time (no countdown possible)', () => {
    const d = new Date(Date.now() + 30 * 60_000);
    const appt = {
      title: 'No-time RDV',
      date: d.toISOString().split('T')[0],
    };
    const data = buildWidgetData(BASE_TASKS, [appt as never], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(false);
  });

  it('returns false when there are no appointments', () => {
    const data = buildWidgetData(BASE_TASKS, [], DEFAULT_WIDGET_SETTINGS);
    expect(data.hasImminentAppt).toBe(false);
  });
});

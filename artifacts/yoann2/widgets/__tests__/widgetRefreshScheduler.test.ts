import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions (must be declared before vi.mock factories) ───────

const {
  mockScheduleAlarm,
  mockCancelAlarm,
  mockRequestWidgetUpdate,
  mockGetWidgetDataFromStorage,
  registeredTasks,
} = vi.hoisted(() => ({
  mockScheduleAlarm: vi.fn(),
  mockCancelAlarm: vi.fn(),
  mockRequestWidgetUpdate: vi.fn(),
  mockGetWidgetDataFromStorage: vi.fn(),
  registeredTasks: {} as Record<string, () => Promise<void>>,
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('expo-modules-core', () => ({
  requireNativeModule: vi.fn(() => ({
    scheduleAlarm: mockScheduleAlarm,
    cancelAlarm: mockCancelAlarm,
  })),
}));

vi.mock('expo-task-manager', () => ({
  default: {
    defineTask: (name: string, handler: () => Promise<void>) => {
      registeredTasks[name] = handler;
    },
  },
}));

vi.mock('react-native-android-widget', () => ({
  requestWidgetUpdate: mockRequestWidgetUpdate,
}));

vi.mock('../data', () => ({
  getWidgetDataFromStorage: mockGetWidgetDataFromStorage,
}));

vi.mock('../TodoWidget', () => ({
  TodoWidget: () => null,
}));

vi.mock('react', () => ({
  default: { createElement: vi.fn(() => null) },
  createElement: vi.fn(() => null),
}));

// ── Import the module under test (triggers defineTask at module-load time) ───

import {
  WIDGET_IMMINENT_REFRESH_TASK,
  cancelImminentRefresh,
  scheduleImminentRefresh,
} from '../widgetRefreshScheduler.android';

// ── Helpers ──────────────────────────────────────────────────────────────────

function runTask(): Promise<void> {
  const handler = registeredTasks[WIDGET_IMMINENT_REFRESH_TASK];
  if (!handler) throw new Error(`Task "${WIDGET_IMMINENT_REFRESH_TASK}" was never registered`);
  return handler();
}

function makeWidgetData(hasImminentAppt: boolean) {
  return {
    hasImminentAppt,
    tasks: [],
    todayAppts: [],
    nextApptLabel: '',
    nextEvent: null,
    widgetAppts: [],
    todayWork: '',
    confirmTask: null,
    settings: {} as never,
    todayLabel: '',
    todayDayNum: 1,
    marieCircleColor: '#000',
    nounouName: '',
    nounouColor: '',
    nounouPeriod: '',
    nounouDuration: '',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('WIDGET_IMMINENT_REFRESH task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestWidgetUpdate.mockResolvedValue(undefined);
  });

  it('registers the task with the correct name at module-load time', () => {
    expect(registeredTasks[WIDGET_IMMINENT_REFRESH_TASK]).toBeDefined();
  });

  describe('when an appointment is still imminent (hasImminentAppt = true)', () => {
    beforeEach(() => {
      mockGetWidgetDataFromStorage.mockResolvedValue(makeWidgetData(true));
    });

    it('calls requestWidgetUpdate once', async () => {
      await runTask();
      expect(mockRequestWidgetUpdate).toHaveBeenCalledTimes(1);
    });

    it('calls requestWidgetUpdate with widgetName = "TodoWidget"', async () => {
      await runTask();
      expect(mockRequestWidgetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ widgetName: 'TodoWidget' }),
      );
    });

    it('does NOT call cancelAlarm', async () => {
      await runTask();
      expect(mockCancelAlarm).not.toHaveBeenCalled();
    });
  });

  describe('when the appointment is no longer imminent (hasImminentAppt = false)', () => {
    beforeEach(() => {
      mockGetWidgetDataFromStorage.mockResolvedValue(makeWidgetData(false));
    });

    it('calls cancelAlarm (stops the 60 s loop)', async () => {
      await runTask();
      expect(mockCancelAlarm).toHaveBeenCalledTimes(1);
    });

    it('does NOT call requestWidgetUpdate', async () => {
      await runTask();
      expect(mockRequestWidgetUpdate).not.toHaveBeenCalled();
    });
  });
});

describe('scheduleImminentRefresh / cancelImminentRefresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scheduleImminentRefresh calls WidgetAlarm.scheduleAlarm with 60 000 ms', async () => {
    await scheduleImminentRefresh();
    expect(mockScheduleAlarm).toHaveBeenCalledWith(60_000);
  });

  it('cancelImminentRefresh calls WidgetAlarm.cancelAlarm', async () => {
    await cancelImminentRefresh();
    expect(mockCancelAlarm).toHaveBeenCalledTimes(1);
  });
});

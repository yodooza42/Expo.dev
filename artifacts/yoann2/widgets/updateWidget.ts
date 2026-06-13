interface RawTaskLike {
  title: string;
  dueDate: string;
  priority: string;
  status: string;
}

interface RawApptLike {
  title: string;
  date: string;
  time: string;
}

export async function updateTodoWidget(
  _tasks?: RawTaskLike[],
  _appointments?: RawApptLike[]
): Promise<void> {
  // No-op on web / iOS. The Android implementation lives in updateWidget.android.tsx.
}

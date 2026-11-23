export const JOURNAL_PAPER = {
  width: 720, height: 1280, gridSize: 16, bindingWidth: 144, gridStart: 148,
  textLeft: 166, textWidth: 500, contentRight: 680, punchX: 44,
  punchCenters: [155, 425, 795, 1080],
} as const;

/** Paper colors intentionally belong to the film, independently of the app's dark/light theme. */
export const JOURNAL_COLORS = {
  paper: '#FBFBF8', ink: '#243D4B', grid: '#C5CDD2',
  binding: '#F5F7F7', punch: '#334357', divider: '#536F89',
  muted: '#73818A', rule: '#B96A51', white: '#FFFFFF',
};

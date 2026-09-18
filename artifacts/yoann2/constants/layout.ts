import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTall = height > 850;
  const isWide = width > 400;
  return {
    screenW: width,
    screenH: height,
    isTall,
    isWide,
    chartBarH: Math.round(height * 0.135),
    sectionGap: isTall ? 20 : 14,
    cardPadding: isTall ? 16 : 12,
  };
}

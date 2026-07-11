import { useEffect, useState } from 'react';

import {
  getCarPlayerState,
  subscribe,
  pauseCarPlayer,
  resumeCarPlayer,
  nextTrack,
  prevTrack,
  jumpToTrack,
  stopCarPlayer,
  type CarPlayerState,
} from '@/utils/carPlayer';

export function useCarPlayer(): CarPlayerState & {
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  jumpTo: (index: number) => void;
  stop: () => void;
} {
  const [state, setState] = useState<CarPlayerState>(getCarPlayerState);

  useEffect(() => {
    return subscribe(() => setState(getCarPlayerState()));
  }, []);

  return {
    ...state,
    pause: pauseCarPlayer,
    resume: resumeCarPlayer,
    next: nextTrack,
    prev: prevTrack,
    jumpTo: jumpToTrack,
    stop: stopCarPlayer,
  };
}

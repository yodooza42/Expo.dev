type Listener = () => void;

const listeners = new Set<Listener>();

export const tripEvents = {
  onTripUpdated(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emitTripUpdated(): void {
    listeners.forEach(fn => fn());
  },
};

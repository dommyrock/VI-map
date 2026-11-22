import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { RegionInfo } from '../lib/schema';
import type { ViewContext } from '../views/types';

export type AppContext = ViewContext & { regionInfo: Record<string, RegionInfo> };
export const App = createContext<AppContext | null>(null);
export const useApp = () => {
  const ctx = useContext(App);
  if (!ctx) throw new Error('useApp outside <App.Provider>');
  return ctx;
};

/** ⌘/Ctrl/Shift-click adds to the selection. */
export const isMulti = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey;

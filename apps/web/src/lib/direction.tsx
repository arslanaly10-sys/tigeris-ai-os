import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Direction = 'ltr' | 'rtl';

const DirectionContext = createContext<{ dir: Direction; toggle: () => void }>({
  dir: 'ltr',
  toggle: () => {},
});

const KEY = 'tigeris.layoutDirection';

function readStored(): Direction {
  try {
    return localStorage.getItem(KEY) === 'rtl' ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/**
 * Layout direction (D-08). English ships first; the RTL preview mirrors layout so every screen is
 * verified for Arabic before translations exist. Text stays English until reviewed Arabic copy lands.
 */
export function DirectionProvider({ children }: { children: ReactNode }) {
  const [dir, setDir] = useState<Direction>(readStored);

  useEffect(() => {
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(KEY, dir);
    } catch {
      // Preference is a convenience only.
    }
  }, [dir]);

  const toggle = useCallback(() => setDir((d) => (d === 'ltr' ? 'rtl' : 'ltr')), []);
  return <DirectionContext.Provider value={{ dir, toggle }}>{children}</DirectionContext.Provider>;
}

export const useDirection = () => useContext(DirectionContext);

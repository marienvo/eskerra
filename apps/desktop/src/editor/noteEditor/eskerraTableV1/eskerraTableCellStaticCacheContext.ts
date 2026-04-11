import {createContext, useContext} from 'react';

import type {CellStaticSegmentsResult} from './eskerraTableCellStaticSegments';

export type EskerraCellStaticCache = {
  getCellStatic: (cellText: string) => CellStaticSegmentsResult;
  /** Warm Lezer/static segments on hover before click (no-op when empty). */
  prefetchStaticForHover: (cellText: string) => void;
};

export const EskerraCellStaticCacheContext =
  createContext<EskerraCellStaticCache | null>(null);

export function useEskerraCellStaticCache(): EskerraCellStaticCache | null {
  return useContext(EskerraCellStaticCacheContext);
}

import {createContext, useContext} from 'react';

import type {CellStaticSegmentsResult} from './eskerraTableCellStaticSegments';

export type EskerraCellStaticCache = {
  getCellStatic: (cellText: string) => CellStaticSegmentsResult;
};

export const EskerraCellStaticCacheContext =
  createContext<EskerraCellStaticCache | null>(null);

export function useEskerraCellStaticCache(): EskerraCellStaticCache | null {
  return useContext(EskerraCellStaticCacheContext);
}

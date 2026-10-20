import type { FuneralCase } from '@/types'

/** A case is finished once it is marked Completed, or sits in the Completed or Shipped Out / Released column of Chain of Custody. */
export function isCaseDone(c: Pick<FuneralCase, 'status' | 'custodyStage'>): boolean {
  return c.status === 'completed' || c.custodyStage === 'completed' || c.custodyStage === 'shipped_released'
}

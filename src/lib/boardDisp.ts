/** The disposition codes shown in the DISP column of the TV Board. */
export const BOARD_DISP_OPTIONS = ['CVC', 'DMP', 'RNC', 'SHIP-OUT', 'CR/RES', 'CR/BUR', 'CR/SHIP-OUT', 'SHIP-IN', 'MEMORIAL'] as const
export type BoardDisp = (typeof BOARD_DISP_OPTIONS)[number]

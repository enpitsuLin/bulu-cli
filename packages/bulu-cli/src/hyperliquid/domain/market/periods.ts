export const VALID_PERIODS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const

export type Period = (typeof VALID_PERIODS)[number]

const PERIOD_LOOKBACK_MS: Record<Period, number> = {
  '1m': 60 * 60 * 1000 * 2,
  '5m': 60 * 60 * 1000 * 2,
  '15m': 60 * 60 * 1000 * 2,
  '1h': 60 * 60 * 1000 * 5,
  '4h': 60 * 60 * 1000 * 12,
  '1d': 60 * 60 * 1000 * 48,
}

export function isValidPeriod(period: string): period is Period {
  return VALID_PERIODS.includes(period as Period)
}

export function resolvePeriodMs(period: string): number {
  return isValidPeriod(period) ? PERIOD_LOOKBACK_MS[period] : 60 * 60 * 1000 * 24
}

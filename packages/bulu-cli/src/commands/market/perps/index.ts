import { defineCommand } from 'citty'

export default defineCommand({
  meta: { name: 'perps', description: 'Hyperliquid perpetual futures' },
  subCommands: {
    positions: () => import('./positions').then((m) => m.default),
    long: () => import('./long').then((m) => m.default),
    short: () => import('./short').then((m) => m.default),
    close: () => import('./close').then((m) => m.default),
    orders: () => import('./orders').then((m) => m.default),
    cancel: () => import('./cancel').then((m) => m.default),
    status: () => import('./status').then((m) => m.default),
    'stop-loss': () => import('./stop-loss').then((m) => m.default),
    'take-profit': () => import('./take-profit').then((m) => m.default),
    modify: () => import('./modify').then((m) => m.default),
    fills: () => import('./fills').then((m) => m.default),
    history: () => import('./history').then((m) => m.default),
    leverage: () => import('./leverage').then((m) => m.default),
    margin: () => import('./margin').then((m) => m.default),
    'schedule-cancel': () => import('./schedule-cancel').then((m) => m.default),
  },
})

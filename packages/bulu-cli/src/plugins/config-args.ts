import { defineCittyPlugin, type ParsedArgs } from 'citty'
import { configCtx, getDefaultConfigDir, type ConfigArgs } from '../core/config'

export default defineCittyPlugin({
  name: 'config-args',
  setup({ args }) {
    const { 'config-dir': configDir } = args as ParsedArgs<ConfigArgs>
    configCtx.set({ configDir: configDir?.trim() || getDefaultConfigDir() })
  },
  cleanup() {},
})

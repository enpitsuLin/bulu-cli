import { configCtx, createRuntimeConfig } from '#/core/config'
import { defineCittyPlugin } from 'citty'

export default defineCittyPlugin({
  name: 'config',
  setup() {
    configCtx.set({
      config: createRuntimeConfig(),
    })
  },
  cleanup() {},
})

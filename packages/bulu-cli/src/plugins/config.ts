import { configCtx, createConfigContext } from '#/core/config'
import { defineCittyPlugin } from 'citty'

export default defineCittyPlugin({
  name: 'config',
  setup() {
    configCtx.set(createConfigContext())
  },
  cleanup() {
    configCtx.unset()
  },
})

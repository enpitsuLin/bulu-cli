import { createWallet } from 'token-core-node-binding'
import { defineCommand } from 'citty'
import { resolveTCXPassphrase } from '../../core/tcx'

export default defineCommand({
  meta: { name: 'create', description: 'Create a new wallet' },
  args: {
    name: {
      type: 'positional',
      description: 'Wallet name',
      required: true,
    },
  },
  async run({ args }) {
    const passphrase = await resolveTCXPassphrase()
    const wallet = createWallet({
      password: passphrase,
    })

    console.log({ wallet })
  },
})

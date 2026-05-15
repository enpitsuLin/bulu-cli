import { listApiKey, listPolicy, listWallet } from '@bulu-cli/tcx-core'
import { defineCommand } from 'citty'
import { withArgs } from '#/core/args'
import { createDoctorReport } from '#/core/doctor'
import { outputArgs, useOutput, useOutputOptions } from '#/core/output'

export default defineCommand({
  meta: { name: 'doctor', description: 'Check local config and vault health' },
  args: withArgs(
    {
      'config-dir': {
        type: 'string',
        description: 'Config directory to inspect; defaults to BULU_CONFIG_DIR or ~/.config/bulu',
      },
    },
    outputArgs,
  ),
  async run({ args }) {
    const report = createDoctorReport({
      configDir: args['config-dir'],
      readers: {
        listWallet,
        listPolicy,
        listApiKey,
      },
    })
    const output = useOutput()
    const outputOptions = useOutputOptions()

    if (outputOptions.json || outputOptions.format === 'json') {
      output.data(report)
      if (!report.ok) {
        process.exitCode = 1
      }
      return
    }

    output.table(
      report.checks.map((check) => ({
        Check: check.check,
        Status: check.status.toUpperCase(),
        Detail: check.detail,
        Path: check.path ?? '',
      })),
      {
        columns: ['Check', 'Status', 'Detail', 'Path'],
        title: `Doctor: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`,
      },
    )

    if (!report.ok) {
      process.exitCode = 1
    }
  },
})

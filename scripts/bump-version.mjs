#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cargoPackageName = 'bulu_cli_tcx_core'
const defaultPreid = 'alpha'
const managedSources = [
  {
    path: 'packages/bulu-cli/package.json',
    kind: 'package-json',
  },
  {
    path: 'packages/tcx-core/package.json',
    kind: 'package-json',
  },
  {
    path: 'packages/tcx-core/Cargo.toml',
    kind: 'cargo-toml',
  },
  {
    path: 'Cargo.lock',
    kind: 'cargo-lock',
  },
]

// napi-rs build artifacts that need to be committed
const napiArtifacts = ['packages/tcx-core/index.js', 'packages/tcx-core/index.d.ts', 'packages/tcx-core/browser.js']
const helpText = `
Usage:
  node scripts/bump-version.mjs [version] [--yes] [--dry-run] [--no-commit] [--no-tag] [--no-push]

Options:
  --yes        Skip the final confirmation prompt.
  --dry-run    Print the planned file and git changes without writing anything.
  --no-commit  Update version files only. Must be used together with --no-tag and --no-push.
  --no-tag     Skip git tag creation.
  --no-push    Skip pushing the branch and tag.
  --help       Show this help message.
`.trim()
const semverPattern =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))

    if (options.help) {
      console.log(helpText)
      return
    }

    validateOptions(options)

    const sources = readManagedSources()
    const currentVersion = ensureConsistentVersions(sources)
    const nextVersion = options.version ?? null

    await run(options, sources, currentVersion, nextVersion)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
  }
}

async function run(options, sources, currentVersion, providedVersion) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const nextVersion = providedVersion ?? (await promptForVersion(rl, currentVersion))

    ensureValidSemver(nextVersion)

    if (nextVersion === currentVersion) {
      throw new Error(`next version must be different from current version ${currentVersion}`)
    }

    ensureCleanWorkingTree()

    const branch = getCurrentBranch()
    const remote = options.push ? resolvePushRemote(branch) : null
    const tagName = `v${nextVersion}`

    ensureLocalTagAbsent(tagName)

    if (remote) {
      ensureRemoteExists(remote)
      ensureRemoteTagAbsent(remote, tagName)
    }

    const updates = buildUpdates(sources, nextVersion)
    const commands = buildGitCommands({
      branch,
      remote,
      tagName,
      commit: options.commit,
      tag: options.tag,
      push: options.push,
    })

    printSummary({
      currentVersion,
      nextVersion,
      updates,
      commands,
      options,
      branch,
      remote,
      tagName,
    })

    if (options.dryRun) {
      console.log('\nDry run complete. No files were changed.')
      return
    }

    if (!options.yes) {
      const confirmed = await promptConfirm(rl, 'Continue? [y/N] ')
      if (!confirmed) {
        console.log('Aborted.')
        return
      }
    }

    writeUpdates(updates)

    // Build and stage napi artifacts before commit
    if (options.commit) {
      buildAndStageArtifacts(options.dryRun)
    }

    runGitWorkflow(commands)

    console.log(`\nReleased ${nextVersion}.`)
  } finally {
    rl.close()
  }
}

function parseArgs(argv) {
  const options = {
    version: null,
    yes: false,
    dryRun: false,
    commit: true,
    tag: true,
    push: true,
    help: false,
  }

  for (const arg of argv) {
    if (arg === '--yes') {
      options.yes = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--no-commit') {
      options.commit = false
      continue
    }

    if (arg === '--no-tag') {
      options.tag = false
      continue
    }

    if (arg === '--no-push') {
      options.push = false
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`unknown option ${arg}`)
    }

    if (options.version) {
      throw new Error('only one version argument is allowed')
    }

    options.version = arg
  }

  return options
}

function validateOptions(options) {
  if (!options.commit && options.tag) {
    throw new Error('--no-commit must be used together with --no-tag')
  }

  if (!options.commit && options.push) {
    throw new Error('--no-commit must be used together with --no-push')
  }
}

function readManagedSources() {
  return managedSources.map((source) => {
    const content = readFileSync(resolve(rootDir, source.path), 'utf8')
    const version = readVersion(source.kind, content)

    return {
      ...source,
      content,
      version,
    }
  })
}

function ensureConsistentVersions(sources) {
  const versions = new Map()

  for (const source of sources) {
    const paths = versions.get(source.version) ?? []
    paths.push(source.path)
    versions.set(source.version, paths)
  }

  if (versions.size !== 1) {
    const details = Array.from(versions.entries())
      .map(([version, paths]) => `${version}: ${paths.join(', ')}`)
      .join('\n')
    throw new Error(`managed version sources are out of sync:\n${details}`)
  }

  return sources[0].version
}

function readVersion(kind, content) {
  switch (kind) {
    case 'package-json':
      return readPackageJsonVersion(content)
    case 'cargo-toml':
      return readCargoTomlVersion(content)
    case 'cargo-lock':
      return readCargoLockVersion(content)
    default:
      throw new Error(`unsupported source kind ${kind}`)
  }
}

function updateVersion(kind, content, nextVersion) {
  switch (kind) {
    case 'package-json':
      return updatePackageJsonVersion(content, nextVersion)
    case 'cargo-toml':
      return updateCargoTomlVersion(content, nextVersion)
    case 'cargo-lock':
      return updateCargoLockVersion(content, nextVersion)
    default:
      throw new Error(`unsupported source kind ${kind}`)
  }
}

function readPackageJsonVersion(content) {
  const data = JSON.parse(content)

  if (typeof data.version !== 'string' || !data.version) {
    throw new Error('package.json is missing a string version field')
  }

  return data.version
}

function updatePackageJsonVersion(content, nextVersion) {
  const data = JSON.parse(content)
  data.version = nextVersion
  return `${JSON.stringify(data, null, 2)}\n`
}

function readCargoTomlVersion(content) {
  let inPackage = false

  for (const line of content.split('\n')) {
    if (/^\[package\]\s*$/.test(line)) {
      inPackage = true
      continue
    }

    if (inPackage && line.startsWith('[')) {
      inPackage = false
    }

    if (!inPackage) {
      continue
    }

    const match = line.match(/^(\s*version\s*=\s*")([^"]+)(".*)$/)
    if (match) {
      return match[2]
    }
  }

  throw new Error('failed to read version from packages/tcx-core/Cargo.toml')
}

function updateCargoTomlVersion(content, nextVersion) {
  let inPackage = false
  let replaced = false
  const lines = content.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (/^\[package\]\s*$/.test(line)) {
      inPackage = true
      continue
    }

    if (inPackage && line.startsWith('[')) {
      inPackage = false
    }

    if (!inPackage) {
      continue
    }

    if (/^\s*version\s*=/.test(line)) {
      lines[index] = line.replace(/^(\s*version\s*=\s*")([^"]+)(".*)$/, `$1${nextVersion}$3`)
      replaced = true
      break
    }
  }

  if (!replaced) {
    throw new Error('failed to update version in packages/tcx-core/Cargo.toml')
  }

  return lines.join('\n')
}

function readCargoLockVersion(content) {
  const blocks = content.match(/\[\[package\]\]\n[\s\S]*?(?=\n\[\[package\]\]\n|$)/g) ?? []
  let matchedVersion = null

  for (const block of blocks) {
    if (!block.includes(`\nname = "${cargoPackageName}"\n`)) {
      continue
    }

    const match = block.match(/^version = "([^"]+)"/m)
    if (!match) {
      throw new Error(`failed to read version for ${cargoPackageName} from Cargo.lock`)
    }

    if (matchedVersion) {
      throw new Error(`found multiple Cargo.lock entries for ${cargoPackageName}`)
    }

    matchedVersion = match[1]
  }

  if (!matchedVersion) {
    throw new Error(`failed to find Cargo.lock entry for ${cargoPackageName}`)
  }

  return matchedVersion
}

function updateCargoLockVersion(content, nextVersion) {
  let found = 0

  const updated = content.replace(/\[\[package\]\]\n[\s\S]*?(?=\n\[\[package\]\]\n|$)/g, (block) => {
    if (!block.includes(`\nname = "${cargoPackageName}"\n`)) {
      return block
    }

    found += 1
    const nextBlock = block.replace(/^version = "([^"]+)"/m, `version = "${nextVersion}"`)

    if (nextBlock === block) {
      throw new Error(`failed to update version for ${cargoPackageName} in Cargo.lock`)
    }

    return nextBlock
  })

  if (found === 0) {
    throw new Error(`failed to find Cargo.lock entry for ${cargoPackageName}`)
  }

  if (found > 1) {
    throw new Error(`found multiple Cargo.lock entries for ${cargoPackageName}`)
  }

  return updated
}

function ensureValidSemver(version) {
  if (!parseSemver(version)) {
    throw new Error(`invalid semver version ${version}`)
  }
}

function parseSemver(version) {
  const match = version.match(semverPattern)

  if (!match?.groups) {
    return null
  }

  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    prerelease: match.groups.prerelease ? match.groups.prerelease.split('.') : [],
    build: match.groups.build ?? '',
  }
}

function formatSemver(parts) {
  const prerelease = parts.prerelease.length > 0 ? `-${parts.prerelease.join('.')}` : ''
  const build = parts.build ? `+${parts.build}` : ''
  return `${parts.major}.${parts.minor}.${parts.patch}${prerelease}${build}`
}

function getSuggestedVersions(currentVersion) {
  const parsed = parseSemver(currentVersion)
  const preid = resolvePreid(parsed)
  const release = clearPrerelease(parsed)
  const suggestions = [
    {
      label: `prerelease (${formatSemver(nextPrerelease(parsed, preid))})`,
      value: formatSemver(nextPrerelease(parsed, preid)),
    },
    parsed.prerelease.length > 0
      ? {
          label: `release (${formatSemver(release)})`,
          value: formatSemver(release),
        }
      : null,
    {
      label: `prepatch (${formatSemver(addPrerelease(incrementRelease(release, 'patch'), preid))})`,
      value: formatSemver(addPrerelease(incrementRelease(release, 'patch'), preid)),
    },
    {
      label: `patch (${formatSemver(incrementRelease(release, 'patch'))})`,
      value: formatSemver(incrementRelease(release, 'patch')),
    },
    {
      label: `preminor (${formatSemver(addPrerelease(incrementRelease(release, 'minor'), preid))})`,
      value: formatSemver(addPrerelease(incrementRelease(release, 'minor'), preid)),
    },
    {
      label: `minor (${formatSemver(incrementRelease(release, 'minor'))})`,
      value: formatSemver(incrementRelease(release, 'minor')),
    },
    {
      label: `premajor (${formatSemver(addPrerelease(incrementRelease(release, 'major'), preid))})`,
      value: formatSemver(addPrerelease(incrementRelease(release, 'major'), preid)),
    },
    {
      label: `major (${formatSemver(incrementRelease(release, 'major'))})`,
      value: formatSemver(incrementRelease(release, 'major')),
    },
  ].filter(Boolean)

  const deduped = []
  const seen = new Set()

  for (const suggestion of suggestions) {
    if (suggestion.value === currentVersion || seen.has(suggestion.value)) {
      continue
    }

    seen.add(suggestion.value)
    deduped.push(suggestion)
  }

  deduped.push({
    label: 'custom',
    value: 'custom',
  })

  return deduped
}

function resolvePreid(parsed) {
  const existing = parsed.prerelease.find((part) => !/^\d+$/.test(part))
  return existing || defaultPreid
}

function clearPrerelease(parsed) {
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: [],
    build: '',
  }
}

function addPrerelease(parsed, preid) {
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: [preid, '0'],
    build: '',
  }
}

function incrementRelease(parsed, level) {
  if (level === 'patch') {
    return {
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch + 1,
      prerelease: [],
      build: '',
    }
  }

  if (level === 'minor') {
    return {
      major: parsed.major,
      minor: parsed.minor + 1,
      patch: 0,
      prerelease: [],
      build: '',
    }
  }

  return {
    major: parsed.major + 1,
    minor: 0,
    patch: 0,
    prerelease: [],
    build: '',
  }
}

function nextPrerelease(parsed, preid) {
  const release = clearPrerelease(parsed)

  if (parsed.prerelease.length === 0) {
    return addPrerelease(release, preid)
  }

  if (parsed.prerelease[0] !== preid) {
    return addPrerelease(release, preid)
  }

  const nextIds = [...parsed.prerelease]
  const lastIndex = nextIds.length - 1

  if (/^\d+$/.test(nextIds[lastIndex])) {
    nextIds[lastIndex] = String(Number.parseInt(nextIds[lastIndex], 10) + 1)
  } else {
    nextIds.push('0')
  }

  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: nextIds,
    build: '',
  }
}

async function promptForVersion(rl, currentVersion) {
  const suggestions = getSuggestedVersions(currentVersion)

  console.log(`Current version: ${currentVersion}\n`)

  suggestions.forEach((suggestion, index) => {
    console.log(`${index + 1}. ${suggestion.label}`)
  })

  while (true) {
    const answer = (await rl.question('\nSelect a version or enter a custom version: ')).trim()

    if (!answer) {
      return suggestions[0].value
    }

    if (/^\d+$/.test(answer)) {
      const choice = Number.parseInt(answer, 10)
      const selected = suggestions[choice - 1]
      if (selected) {
        if (selected.value === 'custom') {
          return promptCustomVersion(rl)
        }

        return selected.value
      }
    }

    if (parseSemver(answer)) {
      return answer
    }

    console.log('Please choose a listed option or enter a valid semver version.')
  }
}

async function promptCustomVersion(rl) {
  while (true) {
    const answer = (await rl.question('Custom version: ')).trim()

    if (!answer) {
      console.log('Version is required.')
      continue
    }

    if (!parseSemver(answer)) {
      console.log('Please enter a valid semver version.')
      continue
    }

    return answer
  }
}

async function promptConfirm(rl, question) {
  const answer = (await rl.question(question)).trim().toLowerCase()
  return answer === 'y' || answer === 'yes'
}

function ensureCleanWorkingTree() {
  const status = runGit(['status', '--porcelain'])

  if (status.trim()) {
    throw new Error(`working tree is not clean:\n${status.trim()}`)
  }
}

function getCurrentBranch() {
  try {
    const branch = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim()
    if (!branch) {
      throw new Error('missing branch name')
    }
    return branch
  } catch {
    throw new Error('HEAD is detached; check out a branch before bumping versions')
  }
}

function resolvePushRemote(branch) {
  try {
    const remote = runGit(['config', '--get', `branch.${branch}.remote`]).trim()
    return remote || 'origin'
  } catch {
    return 'origin'
  }
}

function ensureRemoteExists(remote) {
  try {
    runGit(['remote', 'get-url', remote])
  } catch {
    throw new Error(`git remote ${remote} does not exist`)
  }
}

function ensureLocalTagAbsent(tagName) {
  const output = runGit(['tag', '--list', tagName]).trim()
  if (output) {
    throw new Error(`local tag ${tagName} already exists`)
  }
}

function ensureRemoteTagAbsent(remote, tagName) {
  try {
    const output = runGit(['ls-remote', '--tags', '--refs', remote, `refs/tags/${tagName}`]).trim()
    if (output) {
      throw new Error(`remote tag ${tagName} already exists on ${remote}`)
    }
  } catch (error) {
    if (error.message.startsWith('remote tag')) {
      throw error
    }

    throw new Error(`failed to verify remote tag ${tagName} on ${remote}: ${error.message}`)
  }
}

function buildUpdates(sources, nextVersion) {
  return sources.map((source) => ({
    path: source.path,
    currentVersion: source.version,
    nextVersion,
    nextContent: updateVersion(source.kind, source.content, nextVersion),
  }))
}

function buildGitCommands({ branch, remote, tagName, commit, tag, push }) {
  const commands = []
  const managedPaths = managedSources.map((source) => source.path)

  if (commit) {
    commands.push({
      label: 'Stage version files',
      command: ['git', 'add', ...managedPaths],
      run: () => runGitLive(['add', ...managedPaths]),
    })
    commands.push({
      label: 'Create release commit',
      command: ['git', 'commit', '-m', `chore: release ${tagName}`],
      run: () => runGitLive(['commit', '-m', `chore: release ${tagName}`]),
    })
  }

  if (tag) {
    commands.push({
      label: 'Create annotated tag',
      command: ['git', 'tag', '-a', tagName, '-m', tagName],
      run: () => runGitLive(['tag', '-a', tagName, '-m', tagName]),
    })
  }

  if (push) {
    commands.push({
      label: tag ? 'Push branch and tag' : 'Push branch',
      command: tag ? ['git', 'push', remote, branch, '--follow-tags'] : ['git', 'push', remote, branch],
      run: () => runGitLive(tag ? ['push', remote, branch, '--follow-tags'] : ['push', remote, branch]),
    })
  }

  return commands
}

function printSummary({ currentVersion, nextVersion, updates, commands, options, branch, remote, tagName }) {
  console.log('\nVersion bump summary')
  console.log(`  current: ${currentVersion}`)
  console.log(`  next:    ${nextVersion}`)
  console.log(`  branch:  ${branch}`)

  if (remote) {
    console.log(`  remote:  ${remote}`)
  }

  console.log(`  tag:     ${options.tag ? tagName : '(skipped)'}`)
  console.log('\nFiles')

  for (const update of updates) {
    console.log(`  - ${update.path}: ${update.currentVersion} -> ${update.nextVersion}`)
  }

  console.log('\nGit actions')

  if (commands.length === 0) {
    console.log('  - none')
    return
  }

  if (options.commit) {
    console.log(`  - Build project: pnpm build`)
    console.log(`  - Stage napi artifacts: ${napiArtifacts.join(', ')}`)
  }

  for (const command of commands) {
    console.log(`  - ${command.label}: ${formatCommand(command.command)}`)
  }
}

function writeUpdates(updates) {
  for (const update of updates) {
    writeFileSync(resolve(rootDir, update.path), update.nextContent, 'utf8')
  }
}

function runGitWorkflow(commands) {
  for (const command of commands) {
    command.run()
  }
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stderr = error.stderr?.toString().trim()
    const stdout = error.stdout?.toString().trim()
    const message = stderr || stdout || error.message
    throw new Error(message)
  }
}

function runGitLive(args) {
  try {
    execFileSync('git', args, {
      cwd: rootDir,
      stdio: 'inherit',
    })
  } catch {
    throw new Error(`command failed: ${formatCommand(['git', ...args])}`)
  }
}

function formatCommand(parts) {
  return parts
    .map((part) => {
      if (/^[A-Za-z0-9_./:@=-]+$/.test(part)) {
        return part
      }

      return JSON.stringify(part)
    })
    .join(' ')
}

function buildAndStageArtifacts(dryRun) {
  // Run pnpm build to generate napi artifacts
  console.log('\nBuilding project...')
  if (dryRun) {
    console.log(`  [dry-run] Would run: pnpm build`)
  } else {
    try {
      execSync('pnpm build', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'inherit',
      })
      console.log('Build completed.')
    } catch (error) {
      throw new Error(`build failed: ${error.message}`)
    }
  }

  // Stage napi artifact files
  console.log('Staging napi artifacts...')
  for (const artifact of napiArtifacts) {
    if (dryRun) {
      console.log(`  [dry-run] Would stage: ${artifact}`)
    } else {
      try {
        runGit(['add', artifact])
        console.log(`  Staged: ${artifact}`)
      } catch {
        // File may not exist, skip
        console.log(`  Skipped (not found): ${artifact}`)
      }
    }
  }
}

await main()

#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'yaml';
import { Account, RolloutState } from '../types';
import { createModuleLogger } from '../log';

const log = createModuleLogger('gradual-rollout');

async function loadRolloutState(): Promise<RolloutState | null> {
  const statePath = join(process.cwd(), 'data', 'rollout-state.json');
  if (!existsSync(statePath)) return null;

  try {
    const stateJson = readFileSync(statePath, 'utf8');
    return JSON.parse(stateJson);
  } catch {
    return null;
  }
}

async function saveRolloutState(state: RolloutState): Promise<void> {
  const statePath = join(process.cwd(), 'data', 'rollout-state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function updateAccountsConfig(activeHandles: string[]): Promise<void> {
  const configPath = join(process.cwd(), 'config', 'accounts.yaml');
  const configYaml = readFileSync(configPath, 'utf8');
  const config = yaml.parse(configYaml);

  // Update active status based on rollout
  for (const account of config.accounts) {
    account.active = activeHandles.includes(account.handle);
  }

  writeFileSync(configPath, yaml.stringify(config));
  log.info({ activeAccounts: activeHandles }, 'Updated accounts configuration');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Gradual Rollout Management Tool

Usage: npm run rollout:gradual [command] [options]

Commands:
  status          Show current rollout status (default)
  advance         Manually advance to next phase
  reset           Reset rollout to beginning
  complete        Activate all accounts immediately

Options:
  --force         Skip confirmation prompts
  --help, -h      Show this help message

Environment Variables:
  ROLLOUT_MODE=gradual                Enable gradual rollout
  ROLLOUT_START_ACCOUNTS=1           Number of accounts to start with
  ROLLOUT_INCREMENT_HOURS=24         Hours between phases

Examples:
  npm run rollout:gradual
  npm run rollout:gradual status
  npm run rollout:gradual advance
  npm run rollout:gradual reset --force
`);
    process.exit(0);
  }

  const command = args[0] || 'status';
  const force = args.includes('--force');

  const rolloutMode = process.env.ROLLOUT_MODE || 'gradual';
  const startAccounts = parseInt(process.env.ROLLOUT_START_ACCOUNTS || '1');
  const incrementHours = parseInt(process.env.ROLLOUT_INCREMENT_HOURS || '24');

  if (rolloutMode !== 'gradual') {
    console.log('⚠️  Rollout mode is not set to "gradual"');
    console.log('   Set ROLLOUT_MODE=gradual in your .env file to enable gradual rollout');
    process.exit(1);
  }

  // Load accounts configuration
  const configPath = join(process.cwd(), 'config', 'accounts.yaml');
  if (!existsSync(configPath)) {
    console.error('❌ accounts.yaml not found');
    process.exit(1);
  }

  const configYaml = readFileSync(configPath, 'utf8');
  const config = yaml.parse(configYaml);
  const accounts = config.accounts as Account[];

  // Sort accounts by priority
  accounts.sort((a, b) => (a.priority || 1) - (b.priority || 1));

  const now = Date.now();

  switch (command) {
    case 'status':
      await showRolloutStatus(accounts, startAccounts, incrementHours);
      break;

    case 'advance':
      await advanceRollout(accounts, startAccounts, incrementHours, force);
      break;

    case 'reset':
      await resetRollout(accounts, startAccounts, incrementHours, force);
      break;

    case 'complete':
      await completeRollout(accounts, force);
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('   Use --help to see available commands');
      process.exit(1);
  }
}

async function showRolloutStatus(accounts: Account[], startAccounts: number, incrementHours: number) {
  const state = await loadRolloutState();

  console.log('📊 Gradual Rollout Status\n');

  if (!state) {
    console.log('🚀 Rollout not yet started');
    console.log(`   Will start with ${startAccounts} account(s)`);
    console.log(`   Phases will advance every ${incrementHours} hours`);
    console.log('   Run "npm run rollout:gradual advance" to begin');
  } else {
    const totalAccounts = accounts.length;
    const currentlyActive = state.activeAccounts.length;
    const hoursUntilNext = state.nextPhaseAt > Date.now()
      ? Math.round((state.nextPhaseAt - Date.now()) / (60 * 60 * 1000))
      : 0;

    console.log(`📈 Phase: ${state.currentPhase}/${totalAccounts}`);
    console.log(`👥 Active Accounts: ${currentlyActive}/${totalAccounts}`);

    console.log('\n🎯 Currently Active:');
    for (const handle of state.activeAccounts) {
      const account = accounts.find(a => a.handle === handle);
      console.log(`   ✅ ${handle} (priority ${account?.priority || 'unknown'})`);
    }

    const inactiveAccounts = accounts
      .filter(a => !state.activeAccounts.includes(a.handle))
      .slice(0, 3); // Show next 3

    if (inactiveAccounts.length > 0) {
      console.log('\n⏳ Next to Activate:');
      for (const account of inactiveAccounts) {
        console.log(`   ⏸️  ${account.handle} (priority ${account.priority})`);
      }
    }

    if (hoursUntilNext > 0) {
      console.log(`\n⏰ Next phase in: ${hoursUntilNext} hours`);
    } else if (currentlyActive < totalAccounts) {
      console.log('\n🔄 Ready to advance to next phase');
      console.log('   Run "npm run rollout:gradual advance" to continue');
    } else {
      console.log('\n🎉 Rollout complete! All accounts are active');
    }

    // Rollout timeline
    console.log('\n📅 Rollout Timeline:');
    const startDate = new Date(state.startedAt);
    console.log(`   Started: ${startDate.toLocaleString()}`);

    if (state.nextPhaseAt > Date.now()) {
      const nextDate = new Date(state.nextPhaseAt);
      console.log(`   Next Phase: ${nextDate.toLocaleString()}`);
    }

    if (currentlyActive < totalAccounts) {
      const estimatedCompletion = new Date(
        state.startedAt + (totalAccounts - 1) * incrementHours * 60 * 60 * 1000
      );
      console.log(`   Estimated Completion: ${estimatedCompletion.toLocaleString()}`);
    }
  }

  console.log('\n💡 Commands:');
  console.log('   npm run rollout:gradual advance  - Move to next phase');
  console.log('   npm run rollout:gradual reset    - Start over');
  console.log('   npm run rollout:gradual complete - Activate all accounts now');
}

async function advanceRollout(accounts: Account[], startAccounts: number, incrementHours: number, force: boolean) {
  let state = await loadRolloutState();
  const now = Date.now();

  if (!state) {
    // Initialize new rollout
    state = {
      startedAt: now,
      currentPhase: 1,
      activeAccounts: accounts.slice(0, startAccounts).map(a => a.handle),
      nextPhaseAt: now + incrementHours * 60 * 60 * 1000
    };

    console.log('🚀 Initializing gradual rollout');
    console.log(`   Starting with ${startAccounts} account(s)`);
    console.log(`   Active: ${state.activeAccounts.join(', ')}`);

  } else if (state.currentPhase >= accounts.length) {
    console.log('✅ Rollout already complete - all accounts are active');
    return;

  } else {
    // Check if it's time to advance
    if (now < state.nextPhaseAt && !force) {
      const hoursLeft = Math.round((state.nextPhaseAt - now) / (60 * 60 * 1000));
      console.log(`⏰ Too early to advance. Next phase available in ${hoursLeft} hours`);
      console.log('   Use --force to advance immediately');
      return;
    }

    // Advance to next phase
    const nextPhase = state.currentPhase + 1;
    const accountsToActivate = Math.min(nextPhase, accounts.length);

    state.currentPhase = nextPhase;
    state.activeAccounts = accounts.slice(0, accountsToActivate).map(a => a.handle);
    state.nextPhaseAt = now + incrementHours * 60 * 60 * 1000;

    const newlyActivated = accounts.slice(accountsToActivate - 1, accountsToActivate).map(a => a.handle);

    console.log(`📈 Advanced to phase ${nextPhase}`);
    console.log(`   Newly activated: ${newlyActivated.join(', ')}`);
    console.log(`   Total active: ${state.activeAccounts.length}/${accounts.length}`);

    if (nextPhase < accounts.length) {
      console.log(`   Next phase in ${incrementHours} hours`);
    } else {
      console.log('   🎉 Rollout complete!');
    }
  }

  // Update configuration
  await updateAccountsConfig(state.activeAccounts);
  await saveRolloutState(state);

  console.log('\n✅ Configuration updated');
}

async function resetRollout(accounts: Account[], startAccounts: number, incrementHours: number, force: boolean) {
  if (!force) {
    console.log('⚠️  This will reset the rollout to the beginning');
    console.log('   Use --force to confirm this action');
    return;
  }

  const now = Date.now();
  const state: RolloutState = {
    startedAt: now,
    currentPhase: 1,
    activeAccounts: accounts.slice(0, startAccounts).map(a => a.handle),
    nextPhaseAt: now + incrementHours * 60 * 60 * 1000
  };

  await updateAccountsConfig(state.activeAccounts);
  await saveRolloutState(state);

  console.log('🔄 Rollout reset to beginning');
  console.log(`   Active accounts: ${state.activeAccounts.join(', ')}`);
  console.log(`   Next phase in ${incrementHours} hours`);
}

async function completeRollout(accounts: Account[], force: boolean) {
  if (!force) {
    console.log('⚠️  This will immediately activate all accounts');
    console.log('   Use --force to confirm this action');
    return;
  }

  const allHandles = accounts.map(a => a.handle);
  const state: RolloutState = {
    startedAt: Date.now(),
    currentPhase: accounts.length,
    activeAccounts: allHandles,
    nextPhaseAt: Date.now()
  };

  await updateAccountsConfig(state.activeAccounts);
  await saveRolloutState(state);

  console.log('🎉 Rollout completed - all accounts activated');
  console.log(`   Active accounts: ${allHandles.join(', ')}`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Gradual rollout tool failed:', error.message);
    process.exit(1);
  });
}

export { main as gradualRolloutTool };
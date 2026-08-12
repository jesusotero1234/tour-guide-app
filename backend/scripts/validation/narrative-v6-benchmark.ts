import 'dotenv/config';
import { resolve } from 'path';
import {
  NarrativeBenchmarkRunnerV6,
  parseNarrativeBenchmarkArgsV6,
  runNarrativeBenchmarkV6,
} from '../../src/services/poi/NarrativeBenchmarkV6';
import { NarrativeSpendLedgerV6 } from '../../src/services/poi/NarrativeSpendLedgerV6';

export async function runNarrativeBenchmarkCliV6(
  args: readonly string[],
  runner?: NarrativeBenchmarkRunnerV6
): Promise<void> {
  const options = parseNarrativeBenchmarkArgsV6(args);
  if (!args.includes('--allow-external')) {
    throw new Error('narrative V6 benchmark requires explicit --allow-external authorization');
  }
  const selectedRunner = runner ?? await loadRunner(args);
  if (!selectedRunner) {
    throw new Error(
      'narrative V6 benchmark requires an injected runner or --runner-module; refusing external calls'
    );
  }
  const report = await runNarrativeBenchmarkV6(options, selectedRunner, Date.now, {
    spendLedger: new NarrativeSpendLedgerV6({
      limitUsd: options.maxSpendUsd,
      path: argumentValue(args, '--spend-ledger')
        ?? process.env.NARRATIVE_V6_SPEND_LEDGER_PATH,
    }),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'ready') process.exitCode = 1;
}

function argumentValue(args: readonly string[], flag: string): string | undefined {
  const exact = args.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

async function loadRunner(args: readonly string[]): Promise<NarrativeBenchmarkRunnerV6 | undefined> {
  const exact = args.find((argument) => argument.startsWith('--runner-module='));
  const flagIndex = args.indexOf('--runner-module');
  const modulePath = exact?.slice('--runner-module='.length)
    ?? (flagIndex < 0 ? undefined : args[flagIndex + 1]);
  if (!modulePath) return undefined;
  const loaded = await import(resolve(process.cwd(), modulePath)) as {
    default?: unknown;
    narrativeBenchmarkRunnerV6?: unknown;
  };
  const candidate = loaded.narrativeBenchmarkRunnerV6 ?? loaded.default;
  if (!isRunner(candidate)) throw new Error('--runner-module did not export a V6 benchmark runner');
  return candidate;
}

function isRunner(value: unknown): value is NarrativeBenchmarkRunnerV6 {
  if (typeof value !== 'object' || value === null) return false;
  const runner = value as Partial<NarrativeBenchmarkRunnerV6>;
  return typeof runner.preflight === 'function'
    && typeof runner.runPaidSmokes === 'function'
    && typeof runner.runTour === 'function';
}

if (require.main === module) {
  runNarrativeBenchmarkCliV6(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[narrative-v6-benchmark] ${message}\n`);
    process.exitCode = 1;
  });
}

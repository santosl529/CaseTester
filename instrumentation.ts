// Next's startup hook (Lorenzo, 28 Oct): the D2 guard and the active switch list at boot, not at the first case load.
// Production refuses to start with ENGINE_SWITCHES set unless ENGINE_SWITCHES_PRODUCTION=demo
// (lib/cases/engine-switches.ts). The listed cases are named by id only: a function bundle need not hold cases/.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertNoEngineSwitchesInProduction, activeSwitchesLine } = await import('@/lib/cases/engine-switches');
  const { LISTED_CASE_IDS } = await import('@/lib/cases/listed');
  assertNoEngineSwitchesInProduction();
  console.log(activeSwitchesLine(LISTED_CASE_IDS.map(id => ({ id }))));
}

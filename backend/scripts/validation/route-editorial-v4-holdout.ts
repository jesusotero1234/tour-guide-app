import { runEditorialV4Workbench } from './route-editorial-v4';

runEditorialV4Workbench({ allowHoldout: true }).catch((error) => {
  console.error('[route-editorial-v4-holdout] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});


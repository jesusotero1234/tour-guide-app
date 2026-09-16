import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pilotLaunchReady } from './pilotLaunch';
test('launch stays closed until real notice fields and explicit launch attestations exist', async () => {
  const old = process.env.PILOT_NOTICE_FILE;
  const dir = await mkdtemp(join(tmpdir(),'pilot-notice-'));
  try {
    delete process.env.PILOT_NOTICE_FILE; expect(await pilotLaunchReady()).toBe(false);
    process.env.PILOT_NOTICE_FILE=join(dir,'notice.json');
    expect(await pilotLaunchReady()).toBe(false);
    const notice = { operatorName:'Test operator',contactEmail:'test@example.org',hosting:'Test host',processors:'Test providers',
      transfers:'Test transfer assessment',retention:'Test retention',legalBases:'Test purposes',rights:'Test rights',
      launchReview:{acceptedForPilot:false,legalReference:'private/legal-review',voiceOriginReference:'private/voice-review',aiTransparencyReference:'private/ai-review'} };
    await writeFile(process.env.PILOT_NOTICE_FILE,JSON.stringify(notice)); expect(await pilotLaunchReady()).toBe(false);
    notice.launchReview.acceptedForPilot=true;
    await writeFile(process.env.PILOT_NOTICE_FILE,JSON.stringify(notice)); expect(await pilotLaunchReady()).toBe(true);
    notice.contactEmail='';
    await writeFile(process.env.PILOT_NOTICE_FILE,JSON.stringify(notice)); expect(await pilotLaunchReady()).toBe(false);
  } finally { if(old===undefined) delete process.env.PILOT_NOTICE_FILE; else process.env.PILOT_NOTICE_FILE=old; await rm(dir,{recursive:true,force:true}); }
});

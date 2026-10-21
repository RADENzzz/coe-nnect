import { seedE2eData } from './seed';

export default async function globalSetup(): Promise<void> {
  const state = await seedE2eData();
  console.log(
    `E2E seed ready: term ${state.termId}, subject ${state.subjectCode}, ` +
      `section ${state.sectionCode}.`,
  );
}

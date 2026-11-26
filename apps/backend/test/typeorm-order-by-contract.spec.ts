import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');
const read = (...segments: string[]) =>
  readFileSync(join(repoRoot, ...segments), 'utf8');

const queryFiles = [
  {
    path: 'apps/backend/src/modules/scheduling/services/schedule-publish.service.ts',
    alias: 'r',
  },
  {
    path: 'apps/backend/src/modules/scheduling/services/schedule-unfinalize.service.ts',
    alias: 'r',
  },
  {
    path: 'apps/backend/src/modules/approvals/approvals.service.ts',
    alias: 'r',
  },
  {
    path: 'apps/backend/src/modules/notifications/notifications.service.ts',
    alias: 'n',
  },
];

describe('TypeORM orderBy property contract', () => {
  for (const { path, alias } of queryFiles) {
    it(`uses the createdAt entity property in ${path}`, () => {
      const source = read(path);

      assert.doesNotMatch(
        source,
        new RegExp(`\\.orderBy\\('${alias}\\.created_at'`),
        'orderBy must use the entity property name, not the database column name',
      );
      assert.match(source, new RegExp(`\\.orderBy\\('${alias}\\.createdAt'`));
    });
  }
});

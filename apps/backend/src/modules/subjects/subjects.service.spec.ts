import { ConflictException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { SubjectsService } from './subjects.service';

function makeService(existing: unknown) {
  const repo = {
    findOne: jest
      .fn()
      .mockResolvedValueOnce({ subjectId: '43', deptId: '1', subjectCode: 'OLD 100' })
      .mockResolvedValueOnce(existing),
    save: jest.fn(),
  };
  const service = new SubjectsService(
    repo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { assertDepartmentActive: jest.fn().mockResolvedValue(undefined) } as any,
    { assertUsable: jest.fn().mockResolvedValue(undefined) } as any,
    {
      hasActiveGrant: jest.fn().mockResolvedValue(false),
      revokeGrantsForOwner: jest.fn().mockResolvedValue(undefined),
    } as any,
  );
  return { service, repo };
}

test('update rejects a duplicate subject code before saving', async () => {
  const { service, repo } = makeService({ subjectId: '99', subjectCode: 'A&H 100' });
  await assert.rejects(
    service.update(
      '43',
      { subjectCode: 'A&H 100' } as any,
      { role: 'administrator', deptId: '1' } as any,
    ),
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.equal((error as any).message, 'Subject code "A&H 100" already exists');
      return true;
    },
  );
  assert.equal(repo.save.mock.calls.length, 0);
});

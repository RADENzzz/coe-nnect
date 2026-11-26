import 'reflect-metadata';

import { validate } from 'class-validator';
import {
  ApplyReuseDto,
  PreflightReuseDto,
} from '../src/modules/scheduling/dto/reuse-published-version.dto';

describe('published version reuse DTOs', () => {
  it('accepts numeric term and department ids on preflight', async () => {
    const dto = Object.assign(new PreflightReuseDto(), {
      termId: '1',
      deptId: '2',
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('requires both termId and deptId', async () => {
    const dto = Object.assign(new PreflightReuseDto(), { termId: '1' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('deptId');

    const missingTerm = Object.assign(new PreflightReuseDto(), { deptId: '2' });
    const termErrors = await validate(missingTerm);
    expect(termErrors.map((error) => error.property)).toContain('termId');
  });

  it('requires confirmed true on apply', async () => {
    const dto = Object.assign(new ApplyReuseDto(), {
      termId: '1',
      deptId: '2',
      confirmed: true,
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects confirmed false and a missing confirmation', async () => {
    const rejected = Object.assign(new ApplyReuseDto(), {
      termId: '1',
      deptId: '2',
      confirmed: false,
    });
    expect((await validate(rejected)).map((error) => error.property)).toContain(
      'confirmed',
    );

    const missing = Object.assign(new ApplyReuseDto(), {
      termId: '1',
      deptId: '2',
    });
    expect((await validate(missing)).map((error) => error.property)).toContain(
      'confirmed',
    );
  });

  it('still validates inherited ids on apply', async () => {
    const dto = Object.assign(new ApplyReuseDto(), {
      termId: 'not-a-number',
      deptId: '2',
      confirmed: true,
    });
    expect((await validate(dto)).map((error) => error.property)).toContain(
      'termId',
    );
  });
});

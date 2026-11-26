import 'reflect-metadata';
import { validate } from 'class-validator';
import { UpdateStatusDto } from '../src/modules/scheduling/dto/update-status.dto';

const dtoWithStatus = (status: unknown) =>
  Object.assign(new UpdateStatusDto(), { status });

describe('UpdateStatusDto', () => {
  it.each(['draft', 'review', 'finalized'])(
    'accepts the editable status %s',
    async (status) => {
      expect(await validate(dtoWithStatus(status))).toEqual([]);
    },
  );

  it('rejects direct publication at the validation boundary', async () => {
    const errors = await validate(dtoWithStatus('published'));

    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });
});

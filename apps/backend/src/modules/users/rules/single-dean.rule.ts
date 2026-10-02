import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { ConflictException } from '@nestjs/common';

/**
 * Only one active College Dean may exist at a time.
 * Used before promoting a user to college_dean or assigning the role.
 */
export async function enforceSingleDeanRule(
  userRepo: Repository<User>,
  candidateUserId: string,
): Promise<void> {
  const activeDean = await userRepo.findOne({
    where: { role: 'college_dean', isActive: true },
  });

  if (activeDean && activeDean.userId !== candidateUserId) {
    throw new ConflictException(
      `An active College Dean already exists (${activeDean.email}). Deactivate them first.`,
    );
  }
}
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Subject } from './entities/subject.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectRestriction } from './entities/subject-restriction.entity';
import { CreateSubjectRestrictionDto } from './dto/create-subject-restriction.dto';
import { UpdateSubjectRestrictionDto } from './dto/update-subject-restriction.dto';
import { User } from '../users/entities/user.entity';
import { Schedule } from '../scheduling/entities/schedule.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';

/**
 * Postgres error code for foreign key violations.
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_FK_VIOLATION = '23503';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(Subject)
    private readonly repo: Repository<Subject>,
    @InjectRepository(SubjectRestriction)
    private readonly restrictions: Repository<SubjectRestriction>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
    @InjectRepository(Prospectus)
    private readonly prospectusRepo: Repository<Prospectus>,
  ) {}

  // ────────────────────────────────────────────
  // Cross-department protection
  //
  // Dean        → any subject
  // DH          → only subjects owned by own dept
  // Others      → reject (fail-closed)
  //
  // NOTE: the `administrator` role is still accepted here so the
  // hidden dev account retains full access. It is NOT used for
  // user-facing authorization — the Dean is the top role.
  // ────────────────────────────────────────────
  private async assertOwnership(
    subjectId: string,
    profile: User | undefined,
  ): Promise<Subject> {
    if (!profile) throw new ForbiddenException('Not authenticated');

    const subject = await this.findOne(subjectId);

    if (profile.role === 'administrator' || profile.role === 'college_dean') {
      return subject;
    }

    if (profile.role !== 'department_head') {
      throw new ForbiddenException(
        'Only deans and department heads can modify subjects.',
      );
    }

    if (String(subject.deptId) !== String(profile.deptId)) {
      throw new ForbiddenException(
        'You can only modify subjects in your own department.',
      );
    }

    return subject;
  }

  // ────────────────────────────────────────────
  // Reads
  // ────────────────────────────────────────────

  findAll(): Promise<Subject[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { subjectCode: 'ASC' },
    });
  }

  findAllIncludingInactive(): Promise<Subject[]> {
    return this.repo.find({ order: { subjectCode: 'ASC' } });
  }

  async findOne(id: string): Promise<Subject> {
    const found = await this.repo.findOne({ where: { subjectId: id } });
    if (!found) throw new NotFoundException('Subject not found');
    return found;
  }

  // ────────────────────────────────────────────
  // Writes
  // ────────────────────────────────────────────

  async create(dto: CreateSubjectDto, profile: User): Promise<Subject> {
    // DHs can only create subjects in their own department.
    if (profile.role === 'department_head') {
      if (dto.deptId && String(dto.deptId) !== String(profile.deptId)) {
        throw new ForbiddenException(
          'You can only create subjects in your own department.',
        );
      }
      dto.deptId = String(profile.deptId);
    }

    const existing = await this.repo.findOne({
      where: { subjectCode: dto.subjectCode },
    });
    if (existing) {
      throw new ConflictException(
        `Subject code "${dto.subjectCode}" already exists`,
      );
    }

    if (dto.totalUnits !== dto.lectureUnits + dto.labUnits) {
      throw new BadRequestException(
        'totalUnits must equal lectureUnits + labUnits',
      );
    }

    const entity = this.repo.create({
      subjectCode: dto.subjectCode,
      title: dto.title,
      totalUnits: dto.totalUnits,
      lectureUnits: dto.lectureUnits,
      labUnits: dto.labUnits,
      requiredRoomType: (dto.requiredRoomType as any) ?? null,
      isMinor: dto.isMinor ?? false,
      deptId: dto.deptId,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateSubjectDto,
    profile: User,
  ): Promise<Subject> {
    const found = await this.assertOwnership(id, profile);

    // DHs cannot move subjects to a different department.
    if (
      profile.role === 'department_head' &&
      dto.deptId !== undefined &&
      String(dto.deptId) !== String(profile.deptId)
    ) {
      throw new ForbiddenException(
        'You cannot move subjects to a different department.',
      );
    }

    if (dto.subjectCode !== undefined) found.subjectCode = dto.subjectCode;
    if (dto.title !== undefined) found.title = dto.title;
    if (dto.totalUnits !== undefined) found.totalUnits = dto.totalUnits;
    if (dto.lectureUnits !== undefined) found.lectureUnits = dto.lectureUnits;
    if (dto.labUnits !== undefined) found.labUnits = dto.labUnits;
    if (dto.requiredRoomType !== undefined)
      found.requiredRoomType = (dto.requiredRoomType as any) ?? null;
    if (dto.isMinor !== undefined) found.isMinor = dto.isMinor;
    if (dto.deptId !== undefined) found.deptId = dto.deptId;

    if (found.totalUnits !== found.lectureUnits + found.labUnits) {
      throw new BadRequestException(
        'totalUnits must equal lectureUnits + labUnits',
      );
    }

    return this.repo.save(found);
  }

  async toggleActive(id: string, profile: User): Promise<Subject> {
    const found = await this.assertOwnership(id, profile);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  /**
   * Delete a subject.
   *
   * A subject cannot be deleted while it is referenced by:
   *   - schedule rows (FK: schedule_subject_id_fkey)
   *   - prospectus entries (FK on prospectus.subject_id)
   *   - subject restrictions (either side of the pair)
   *
   * We check these *before* issuing the DELETE so the user gets a
   * specific, actionable message instead of a raw Postgres FK error.
   * A catch-all converts any remaining FK violation (e.g. a table we
   * haven't enumerated yet) into the same clean 409 shape.
   *
   * The alternative when references exist is to deactivate the
   * subject instead — we suggest that in the error message.
   */
  async remove(id: string, profile: User): Promise<{ success: boolean }> {
    const found = await this.assertOwnership(id, profile);

    const [scheduleCount, prospectusCount, restrictionCount] =
      await Promise.all([
        this.scheduleRepo.count({ where: { subjectId: id } }),
        this.prospectusRepo.count({ where: { subjectId: id } }),
        this.restrictions
          .createQueryBuilder('r')
          .where('r.subjectId1 = :id OR r.subjectId2 = :id', { id })
          .getCount(),
      ]);

    const blockers: string[] = [];
    if (scheduleCount > 0) {
      blockers.push(
        `${scheduleCount} schedule ${scheduleCount === 1 ? 'entry' : 'entries'}`,
      );
    }
    if (prospectusCount > 0) {
      blockers.push(
        `${prospectusCount} prospectus ${prospectusCount === 1 ? 'mapping' : 'mappings'}`,
      );
    }
    if (restrictionCount > 0) {
      blockers.push(
        `${restrictionCount} subject ${restrictionCount === 1 ? 'restriction' : 'restrictions'}`,
      );
    }

    if (blockers.length > 0) {
      throw new ConflictException(
        `Cannot delete "${found.subjectCode}" — it is still referenced by ${blockers.join(
          ', ',
        )}. Remove those references first, or deactivate the subject instead.`,
      );
    }

    try {
      await this.repo.remove(found);
    } catch (err) {
      // Safety net: any remaining FK violation (a table we didn't
      // enumerate above) still surfaces as a clean 409, never a 500.
      if (
        err instanceof QueryFailedError &&
        (err as any).driverError?.code === PG_FK_VIOLATION
      ) {
        throw new ConflictException(
          `Cannot delete "${found.subjectCode}" — it is still referenced by other data. ` +
            `Deactivate the subject instead.`,
        );
      }
      throw err;
    }

    return { success: true };
  }

  // ────────────────────────────────────────────
  // S-11 — Subject Restrictions
  //
  // Restrictions link two subjects. A DH can only create/update/delete a
  // restriction if they own BOTH subjects. Dean can manage any.
  //
  // NOTE: the `administrator` role is still accepted (dev account
  // bypass). It is NOT used for user-facing authorization.
  // ────────────────────────────────────────────

  async findAllRestrictions(termId?: string): Promise<SubjectRestriction[]> {
    const qb = this.restrictions
      .createQueryBuilder('r')
      .orderBy('r.createdAt', 'DESC');

    if (termId) {
      qb.andWhere('(r.termId = :termId OR r.termId IS NULL)', { termId });
    }
    return qb.getMany();
  }

  async createRestriction(
    dto: CreateSubjectRestrictionDto,
    createdBy: string | undefined,
    profile: User,
  ): Promise<SubjectRestriction> {
    if (dto.subjectId1 === dto.subjectId2) {
      throw new BadRequestException(
        'A subject cannot be restricted against itself.',
      );
    }

    const [a, b] = await Promise.all([
      this.repo.findOne({ where: { subjectId: dto.subjectId1 } }),
      this.repo.findOne({ where: { subjectId: dto.subjectId2 } }),
    ]);
    if (!a || !b) {
      throw new NotFoundException('One or both subjects not found.');
    }

    // Ownership check: a DH can only restrict subjects they own.
    if (profile.role === 'department_head') {
      const myDept = String(profile.deptId);
      if (String(a.deptId) !== myDept || String(b.deptId) !== myDept) {
        throw new ForbiddenException(
          'You can only create restrictions between subjects in your own department.',
        );
      }
    } else if (
      profile.role !== 'administrator' &&
      profile.role !== 'college_dean'
    ) {
      throw new ForbiddenException(
        'Only deans and department heads can manage restrictions.',
      );
    }

    const existing = await this.restrictions
      .createQueryBuilder('r')
      .where(
        `(r.subjectId1 = :a AND r.subjectId2 = :b)
         OR (r.subjectId1 = :b AND r.subjectId2 = :a)`,
        { a: dto.subjectId1, b: dto.subjectId2 },
      )
      .andWhere('r.isActive = true')
      .getOne();
    if (existing) {
      throw new ConflictException(
        'A restriction between these two subjects already exists.',
      );
    }

    const entity = this.restrictions.create({
      subjectId1: dto.subjectId1,
      subjectId2: dto.subjectId2,
      termId: dto.termId ?? null,
      warningMessage: dto.warningMessage ?? null,
      createdBy: createdBy ?? null,
      isActive: true,
    });
    return this.restrictions.save(entity);
  }

  async updateRestriction(
    id: string,
    dto: UpdateSubjectRestrictionDto,
    profile: User,
  ): Promise<SubjectRestriction> {
    const found = await this.restrictions.findOne({
      where: { restrictionId: id },
    });
    if (!found) throw new NotFoundException('Restriction not found');

    // Ownership check: DH can only update restrictions on their own subjects.
    if (profile.role === 'department_head') {
      const [a, b] = await Promise.all([
        this.repo.findOne({ where: { subjectId: found.subjectId1 } }),
        this.repo.findOne({ where: { subjectId: found.subjectId2 } }),
      ]);
      const myDept = String(profile.deptId);
      if (
        !a ||
        !b ||
        String(a.deptId) !== myDept ||
        String(b.deptId) !== myDept
      ) {
        throw new ForbiddenException(
          'You can only update restrictions on subjects in your own department.',
        );
      }
    } else if (
      profile.role !== 'administrator' &&
      profile.role !== 'college_dean'
    ) {
      throw new ForbiddenException(
        'Only deans and department heads can manage restrictions.',
      );
    }

    if (dto.warningMessage !== undefined)
      found.warningMessage = dto.warningMessage ?? null;
    if (dto.isActive !== undefined) found.isActive = dto.isActive;

    return this.restrictions.save(found);
  }

  async removeRestriction(
    id: string,
    profile: User,
  ): Promise<{ success: boolean }> {
    const found = await this.restrictions.findOne({
      where: { restrictionId: id },
    });
    if (!found) throw new NotFoundException('Restriction not found');

    // Ownership check: DH can only remove restrictions on their own subjects.
    if (profile.role === 'department_head') {
      const [a, b] = await Promise.all([
        this.repo.findOne({ where: { subjectId: found.subjectId1 } }),
        this.repo.findOne({ where: { subjectId: found.subjectId2 } }),
      ]);
      const myDept = String(profile.deptId);
      if (
        !a ||
        !b ||
        String(a.deptId) !== myDept ||
        String(b.deptId) !== myDept
      ) {
        throw new ForbiddenException(
          'You can only remove restrictions on subjects in your own department.',
        );
      }
    } else if (
      profile.role !== 'administrator' &&
      profile.role !== 'college_dean'
    ) {
      throw new ForbiddenException(
        'Only deans and department heads can manage restrictions.',
      );
    }

    await this.restrictions.remove(found);
    return { success: true };
  }
}
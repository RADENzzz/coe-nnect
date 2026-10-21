// apps/backend/src/modules/faculty/faculty.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  abbrToFull,
  fullToAbbr,
} from '../../common/utils/day-mapping.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faculty } from './entities/faculty.entity';
import { FacultyQualification } from './entities/faculty-qualification.entity';
import { Subject } from '../subjects/entities/subject.entity';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateQualificationDto } from './dto/create-qualification.dto';
import { UpdateQualificationDto } from './dto/update-qualification.dto';
import { FacultyPreference } from './entities/faculty-preference.entity';
import { CreateFacultyPreferenceDto } from './dto/create-faculty-preference.dto';
import { UpdateFacultyPreferenceDto } from './dto/update-faculty-preference.dto';
import { User } from '../users/entities/user.entity';
import { FacultyUnavailability } from './entities/faculty-unavailability.entity';
import { CreateFacultyUnavailabilityDto } from './dto/create-faculty-unavailability.dto';
import { UpdateFacultyUnavailabilityDto } from './dto/update-faculty-unavailability.dto';
import { DepartmentsService } from '../departments/departments.service';
import type { FacultyStatusSummaryRow } from './dto/faculty-status-summary.dto';

function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(Faculty)
    private readonly repo: Repository<Faculty>,
    @InjectRepository(FacultyQualification)
    private readonly quals: Repository<FacultyQualification>,
    @InjectRepository(FacultyPreference)
    private readonly prefs: Repository<FacultyPreference>,
    @InjectRepository(Subject)
    private readonly subjects: Repository<Subject>,
    @InjectRepository(FacultyUnavailability)
    private readonly unavailabilityRepo: Repository<FacultyUnavailability>,
    private readonly departments: DepartmentsService,
  ) {}

  private async assertOwnership(
    facultyId: string,
    profile: User | undefined,
  ): Promise<Faculty> {
    if (!profile) {
      throw new ForbiddenException('Not authenticated');
    }

    const faculty = await this.findOne(facultyId);

    if (profile.role === 'administrator' || profile.role === 'college_dean') {
      return faculty;
    }

    if (profile.role !== 'department_head') {
      throw new ForbiddenException(
        'Only deans and department heads can modify faculty.',
      );
    }

    if (String(faculty.deptId) !== String(profile.deptId)) {
      throw new ForbiddenException(
        'You can only modify faculty in your own department.',
      );
    }

    return faculty;
  }

  findAll(): Promise<Faculty[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  findAllIncludingInactive(): Promise<Faculty[]> {
    return this.repo.find({
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Faculty> {
    const found = await this.repo.findOne({ where: { facultyId: id } });
    if (!found) throw new NotFoundException('Faculty not found');
    return found;
  }

  async create(dto: CreateFacultyDto, profile: User): Promise<Faculty> {
    if (profile.role === 'department_head') {
      if (dto.deptId && String(dto.deptId) !== String(profile.deptId)) {
        throw new ForbiddenException(
          'You can only create faculty in your own department.',
        );
      }
      dto.deptId = profile.deptId as any;
    }

    // ── NEW: target dept must be active ──
    await this.departments.assertDepartmentActive(dto.deptId);

    const entity = this.repo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email ?? null,
      contact: dto.contact ?? null,
      wmsuId: dto.wmsuId ?? null,
      employeeId: dto.employeeId ?? null,
      deptId: dto.deptId ?? null,
      designationId: dto.designationId ?? null,
      classification: dto.classification,
      requiredHours: dto.requiredHours ?? null,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateFacultyDto,
    profile: User,
  ): Promise<Faculty> {
    const found = await this.assertOwnership(id, profile);

    if (
      profile.role === 'department_head' &&
      dto.deptId !== undefined &&
      String(dto.deptId) !== String(profile.deptId)
    ) {
      throw new ForbiddenException(
        'You cannot move faculty to a different department.',
      );
    }

    // ── NEW: current or target dept must be active ──
    if (dto.deptId !== undefined && dto.deptId !== found.deptId) {
      await this.departments.assertDepartmentActive(dto.deptId);
    } else {
      await this.departments.assertDepartmentActive(found.deptId);
    }

    if (dto.firstName !== undefined) found.firstName = dto.firstName;
    if (dto.lastName !== undefined) found.lastName = dto.lastName;
    if (dto.email !== undefined) found.email = dto.email ?? null;
    if (dto.contact !== undefined) found.contact = dto.contact ?? null;
    if (dto.wmsuId !== undefined) found.wmsuId = dto.wmsuId ?? null;
    if (dto.employeeId !== undefined) found.employeeId = dto.employeeId ?? null;
    if (dto.deptId !== undefined) found.deptId = dto.deptId ?? null;
    if (dto.designationId !== undefined)
      found.designationId = dto.designationId ?? null;
    if (dto.classification !== undefined)
      found.classification = dto.classification;
    if (dto.requiredHours !== undefined)
      found.requiredHours = dto.requiredHours ?? null;

    return this.repo.save(found);
  }

  async toggleActive(id: string, profile: User): Promise<Faculty> {
    const found = await this.assertOwnership(id, profile);
    await this.departments.assertDepartmentActive(found.deptId);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  async remove(id: string, profile: User): Promise<{ success: boolean }> {
    const found = await this.assertOwnership(id, profile);
    await this.departments.assertDepartmentActive(found.deptId);
    await this.repo.remove(found);
    return { success: true };
  }

  async getStatusSummary(deptId?: string): Promise<FacultyStatusSummaryRow[]> {
    const facultyQuery = this.repo
      .createQueryBuilder('f')
      .select(['f.faculty_id AS faculty_id']);

    if (deptId) {
      facultyQuery.where('f.dept_id = :deptId', { deptId });
    }

    const facultyRows = (await facultyQuery.getRawMany()) as {
      faculty_id: string;
    }[];

    if (facultyRows.length === 0) return [];

    const ids = facultyRows.map((r) => String(r.faculty_id));

    const [qualCounts, prefCounts, unavailCounts] = await Promise.all([
      this.quals
        .createQueryBuilder('q')
        .select('q.faculty_id', 'facultyId')
        .addSelect('COUNT(*)', 'count')
        .where('q.faculty_id IN (:...ids)', { ids })
        .groupBy('q.faculty_id')
        .getRawMany<{ facultyId: string; count: string }>(),
      this.prefs
        .createQueryBuilder('p')
        .select('p.faculty_id', 'facultyId')
        .addSelect('COUNT(*)', 'count')
        .where('p.faculty_id IN (:...ids)', { ids })
        .groupBy('p.faculty_id')
        .getRawMany<{ facultyId: string; count: string }>(),
      this.unavailabilityRepo
        .createQueryBuilder('u')
        .select('u.faculty_id', 'facultyId')
        .addSelect('COUNT(*)', 'count')
        .where('u.faculty_id IN (:...ids)', { ids })
        .groupBy('u.faculty_id')
        .getRawMany<{ facultyId: string; count: string }>(),
    ]);

    const toMap = (
      rows: { facultyId: string; count: string }[],
    ): Map<string, number> => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(String(r.facultyId), Number(r.count));
      return m;
    };

    const qMap = toMap(qualCounts);
    const pMap = toMap(prefCounts);
    const uMap = toMap(unavailCounts);

    return facultyRows.map((row) => {
      const id = String(row.faculty_id);
      const qc = qMap.get(id) ?? 0;
      const pc = pMap.get(id) ?? 0;
      const uc = uMap.get(id) ?? 0;
      return {
        facultyId: id,
        qualificationCount: qc,
        hasQualifications: qc > 0,
        preferenceCount: pc,
        hasPreferences: pc > 0,
        unavailabilityCount: uc,
        hasUnavailability: uc > 0,
      };
    });
  }

  async findQualifications(facultyId: string): Promise<FacultyQualification[]> {
    await this.findOne(facultyId);
    return this.quals.find({
      where: { facultyId },
      relations: ['subject'],
      order: { qualId: 'ASC' },
    });
  }

  async addQualification(
    facultyId: string,
    dto: CreateQualificationDto,
    profile: User,
  ): Promise<FacultyQualification> {
    const faculty = await this.assertOwnership(facultyId, profile);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const subject = await this.subjects.findOne({
      where: { subjectId: dto.subjectId },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found.');
    }

    const existing = await this.quals.findOne({
      where: { facultyId, subjectId: dto.subjectId },
    });
    if (existing) {
      throw new ConflictException(
        `"${subject.subjectCode}" is already in this faculty's qualification list.`,
      );
    }

    const entity = this.quals.create({
      facultyId,
      subjectId: dto.subjectId,
      sourceSystem: dto.sourceSystem ?? null,
    });
    const saved = await this.quals.save(entity);
    return this.quals.findOne({
      where: { qualId: saved.qualId },
      relations: ['subject'],
    }) as Promise<FacultyQualification>;
  }

  async updateQualification(
    facultyId: string,
    qualId: string,
    dto: UpdateQualificationDto,
    profile: User,
  ): Promise<FacultyQualification> {
    const faculty = await this.assertOwnership(facultyId, profile);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const found = await this.quals.findOne({
      where: { qualId, facultyId },
    });
    if (!found) throw new NotFoundException('Qualification not found');

    if (dto.subjectId !== undefined && dto.subjectId !== found.subjectId) {
      const subject = await this.subjects.findOne({
        where: { subjectId: dto.subjectId },
      });
      if (!subject) {
        throw new BadRequestException('Subject not found.');
      }
      const clash = await this.quals.findOne({
        where: { facultyId, subjectId: dto.subjectId },
      });
      if (clash) {
        throw new ConflictException(
          `"${subject.subjectCode}" is already in this faculty's qualification list.`,
        );
      }
      found.subjectId = dto.subjectId;
    }

    if (dto.sourceSystem !== undefined) {
      found.sourceSystem = dto.sourceSystem ?? null;
    }

    await this.quals.save(found);
    return this.quals.findOne({
      where: { qualId },
      relations: ['subject'],
    }) as Promise<FacultyQualification>;
  }

  async removeQualification(
    facultyId: string,
    qualId: string,
    profile: User,
  ): Promise<{ success: boolean }> {
    const faculty = await this.assertOwnership(facultyId, profile);
    await this.departments.assertDepartmentActive(faculty.deptId);
    const found = await this.quals.findOne({
      where: { qualId, facultyId },
    });
    if (!found) throw new NotFoundException('Qualification not found');
    await this.quals.remove(found);
    return { success: true };
  }

  async findPreferences(facultyId: string): Promise<FacultyPreference[]> {
    await this.findOne(facultyId);
    const rows = await this.prefs.find({
      where: { facultyId },
      order: { preferenceId: 'ASC' },
    });
    return rows.map((r) => ({
      ...r,
      preferredDay: fullToAbbr(r.preferredDay) as any,
    }));
  }

  async addPreference(
    facultyId: string,
    dto: CreateFacultyPreferenceDto,
    profile: User,
  ): Promise<FacultyPreference> {
    const faculty = await this.assertOwnership(facultyId, profile);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const start = normalizeTime(dto.preferredStartTime);
    const end = normalizeTime(dto.preferredEndTime);
    if (start >= end) {
      throw new BadRequestException(
        'preferredStartTime must be earlier than preferredEndTime.',
      );
    }

    const existing = await this.prefs.findOne({
      where: {
        facultyId,
        preferredDay: abbrToFull(dto.preferredDay) as any,
        preferredStartTime: start,
        preferredEndTime: end,
      },
    });
    if (existing) {
      throw new ConflictException(
        'This preference window already exists for this faculty member.',
      );
    }

    const entity = this.prefs.create({
      facultyId,
      preferredDay: abbrToFull(dto.preferredDay) as any,
      preferredStartTime: start,
      preferredEndTime: end,
    });
    const saved = await this.prefs.save(entity);
    return {
      ...saved,
      preferredDay: fullToAbbr(saved.preferredDay as unknown as string) as any,
    };
  }

  async updatePreference(
    facultyId: string,
    preferenceId: string,
    dto: UpdateFacultyPreferenceDto,
    profile: User,
  ): Promise<FacultyPreference> {
    const faculty = await this.assertOwnership(facultyId, profile);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const found = await this.prefs.findOne({
      where: { preferenceId, facultyId },
    });
    if (!found) throw new NotFoundException('Preference not found');

    const day = dto.preferredDay
      ? abbrToFull(dto.preferredDay)
      : found.preferredDay;
    const start = dto.preferredStartTime
      ? normalizeTime(dto.preferredStartTime)
      : found.preferredStartTime;
    const end = dto.preferredEndTime
      ? normalizeTime(dto.preferredEndTime)
      : found.preferredEndTime;

    if (start >= end) {
      throw new BadRequestException(
        'preferredStartTime must be earlier than preferredEndTime.',
      );
    }

    found.preferredDay = day as any;
    found.preferredStartTime = start;
    found.preferredEndTime = end;
    const saved = await this.prefs.save(found);
    return {
      ...saved,
      preferredDay: fullToAbbr(saved.preferredDay as unknown as string) as any,
    };
  }

  async removePreference(
    facultyId: string,
    preferenceId: string,
    profile: User,
  ): Promise<{ success: boolean }> {
    const faculty = await this.assertOwnership(facultyId, profile);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const found = await this.prefs.findOne({
      where: { preferenceId, facultyId },
    });
    if (!found) throw new NotFoundException('Preference not found');
    await this.prefs.remove(found);
    return { success: true };
  }

  async findUnavailability(
    facultyId: string,
    termId?: string,
  ): Promise<FacultyUnavailability[]> {
    await this.findOne(facultyId);

    const qb = this.unavailabilityRepo
      .createQueryBuilder('u')
      .where('u.faculty_id = :facultyId', { facultyId })
      .orderBy('u.day_of_week', 'ASC')
      .addOrderBy('u.start_time', 'ASC');

    if (termId) {
      qb.andWhere('(u.term_id = :termId OR u.term_id IS NULL)', { termId });
    }

    return qb.getMany();
  }

  async addUnavailability(
    facultyId: string,
    dto: CreateFacultyUnavailabilityDto,
  ): Promise<FacultyUnavailability> {
    const faculty = await this.findOne(facultyId);
    await this.departments.assertDepartmentActive(faculty.deptId);

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    const entity = this.unavailabilityRepo.create({
      facultyId,
      termId: dto.termId ?? null,
      dayOfWeek: dto.dayOfWeek,
      startTime: this.normalizeTime(dto.startTime),
      endTime: this.normalizeTime(dto.endTime),
      reason: dto.reason ?? null,
      source: 'local',
      externalId: null,
      syncedAt: null,
    });

    return this.unavailabilityRepo.save(entity);
  }

  async updateUnavailability(
    facultyId: string,
    unavailabilityId: string,
    dto: UpdateFacultyUnavailabilityDto,
  ): Promise<FacultyUnavailability> {
    const faculty = await this.findOne(facultyId);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const found = await this.unavailabilityRepo.findOne({
      where: { unavailabilityId, facultyId },
    });
    if (!found) {
      throw new NotFoundException(
        `Unavailability block ${unavailabilityId} not found for faculty ${facultyId}`,
      );
    }

    if (dto.dayOfWeek !== undefined) found.dayOfWeek = dto.dayOfWeek;
    if (dto.startTime !== undefined) {
      found.startTime = this.normalizeTime(dto.startTime);
    }
    if (dto.endTime !== undefined) {
      found.endTime = this.normalizeTime(dto.endTime);
    }
    if (dto.reason !== undefined) found.reason = dto.reason ?? null;
    if (dto.termId !== undefined) found.termId = dto.termId ?? null;

    if (found.startTime >= found.endTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    return this.unavailabilityRepo.save(found);
  }

  async removeUnavailability(
    facultyId: string,
    unavailabilityId: string,
  ): Promise<{ success: boolean }> {
    const faculty = await this.findOne(facultyId);
    await this.departments.assertDepartmentActive(faculty.deptId);

    const found = await this.unavailabilityRepo.findOne({
      where: { unavailabilityId, facultyId },
    });
    if (!found) {
      throw new NotFoundException(
        `Unavailability block ${unavailabilityId} not found for faculty ${facultyId}`,
      );
    }

    await this.unavailabilityRepo.remove(found);
    return { success: true };
  }

  private normalizeTime(t: string): string {
    return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
  }
}
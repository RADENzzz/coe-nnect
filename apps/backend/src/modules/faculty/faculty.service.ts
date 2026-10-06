import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
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


// ────────────────────────────────────────────
// day_of_week mapping
//
// The Postgres `day_of_week` enum uses full names
// ("Monday", "Tuesday", ...), but the frontend `Day` type
// uses 3-letter abbreviations ("MON", "TUE", ...).
// Map between them at the API boundary.
// ────────────────────────────────────────────

const ABBR_TO_FULL: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

const FULL_TO_ABBR: Record<string, string> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
  Sunday: 'SUN',
};

function abbrToFull(abbr: string): string {
  return ABBR_TO_FULL[abbr] ?? abbr;
}

function fullToAbbr(full: string): string {
  return FULL_TO_ABBR[full] ?? full;
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
  ) {}

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

  async create(dto: CreateFacultyDto): Promise<Faculty> {
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

  async update(id: string, dto: UpdateFacultyDto): Promise<Faculty> {
    const found = await this.findOne(id);

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

  async toggleActive(id: string): Promise<Faculty> {
    const found = await this.findOne(id);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.findOne(id);
    await this.repo.remove(found);
    return { success: true };
  }

  // ────────────────────────────────────────────
  // Faculty Qualification CRUD (FR 3.1.8 – 3.1.10)
  // ────────────────────────────────────────────

  async findQualifications(facultyId: string): Promise<FacultyQualification[]> {
    // Confirm faculty exists (throws 404 if not)
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
  ): Promise<FacultyQualification> {
    await this.findOne(facultyId);

    const subject = await this.subjects.findOne({
      where: { subjectId: dto.subjectId },
    });
    if (!subject) {
      throw new BadRequestException('Subject not found.');
    }

    // Duplicate check — the DB has no unique constraint so we enforce here
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
  ): Promise<FacultyQualification> {
    await this.findOne(facultyId);

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
      // Duplicate check on the new subject
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
  ): Promise<{ success: boolean }> {
    await this.findOne(facultyId);
    const found = await this.quals.findOne({
      where: { qualId, facultyId },
    });
    if (!found) throw new NotFoundException('Qualification not found');
    await this.quals.remove(found);
    return { success: true };
  }

  // ────────────────────────────────────────────
  // Faculty Preference CRUD (FR 3.1.6 – 3.1.7)   ← NEW SECTION
  // ────────────────────────────────────────────

  async findPreferences(facultyId: string): Promise<FacultyPreference[]> {
    await this.findOne(facultyId);
    const rows = await this.prefs.find({
      where: { facultyId },
      order: { preferenceId: 'ASC' },
    });
    // Convert DB full names back to the frontend's 3-letter abbreviations
    return rows.map((r) => ({
      ...r,
      preferredDay: fullToAbbr(r.preferredDay) as any,
    }));
  }

  async addPreference(
    facultyId: string,
    dto: CreateFacultyPreferenceDto,
  ): Promise<FacultyPreference> {
    await this.findOne(facultyId);

    // Sanity: start < end
    const start = normalizeTime(dto.preferredStartTime);
    const end = normalizeTime(dto.preferredEndTime);
    if (start >= end) {
      throw new BadRequestException(
        'preferredStartTime must be earlier than preferredEndTime.',
      );
    }

    // Duplicate check: same faculty + same day + same window
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
  ): Promise<FacultyPreference> {
    await this.findOne(facultyId);
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
  ): Promise<{ success: boolean }> {
    await this.findOne(facultyId);
    const found = await this.prefs.findOne({
      where: { preferenceId, facultyId },
    });
    if (!found) throw new NotFoundException('Preference not found');
    await this.prefs.remove(found);
    return { success: true };
  }
}

// Helper — normalize "HH:MM" → "HH:MM:00" for consistent string comparison  ← NEW
function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}


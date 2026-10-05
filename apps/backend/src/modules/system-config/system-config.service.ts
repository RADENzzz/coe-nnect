import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulingSetting } from './entities/scheduling-setting.entity';
import { Designation } from './entities/designation.entity';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

/**
 * Setting keys the engine reads. Any key NOT in this list is still
 * accepted (so future engine features can add settings without a backend
 * change), but only known keys get type-validated.
 */
const TIME_KEYS = new Set([
  'operating_hours_start',
  'operating_hours_end',
  'lunch_start',
  'lunch_end',
  'daytime_priority_end_hour',
]);

const NUMBER_KEYS = new Set([
  'max_consecutive_hours',
  'min_break_minutes',
  'lunch_break_minutes',
  'lunch_break_overlap_minutes',
  'visiting_lecturer_max_hours',
  'default_required_hours',
  'release_hours_granularity',
  'lab_split_hours',
  'lecture_block_minutes',
]);

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SchedulingSetting)
    private readonly settings: Repository<SchedulingSetting>,
    @InjectRepository(Designation)
    private readonly designations: Repository<Designation>,
  ) {}

  // ── Settings ──────────────────────────────────

  async findAllSettings(): Promise<SchedulingSetting[]> {
    return this.settings.find({ order: { settingKey: 'ASC' } });
  }

  async updateSettings(
    updates: Record<string, unknown>,
  ): Promise<SchedulingSetting[]> {
    if (!updates || typeof updates !== 'object') {
      throw new BadRequestException('settings must be an object');
    }

    const entries = Object.entries(updates);
    if (entries.length === 0) {
      throw new BadRequestException('No settings provided');
    }

    // Validate
    for (const [key, value] of entries) {
      if (TIME_KEYS.has(key)) {
        if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
          throw new BadRequestException(
            `Setting "${key}" must be a time in HH:MM format (24-hour).`,
          );
        }
      } else if (NUMBER_KEYS.has(key)) {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n) || n < 0) {
          throw new BadRequestException(
            `Setting "${key}" must be a non-negative number.`,
          );
        }
      }
      // Unknown keys pass through — future-proofing
    }

    // Upsert each
    for (const [key, value] of entries) {
      const existing = await this.settings.findOne({
        where: { settingKey: key },
      });

      if (existing) {
        existing.value = value;
        existing.updatedAt = new Date();
        await this.settings.save(existing);
      } else {
        const fresh = this.settings.create({
          settingKey: key,
          value,
          description: null,
          updatedAt: new Date(),
        });
        await this.settings.save(fresh);
      }
    }

    return this.findAllSettings();
  }

  // ── Designations ──────────────────────────────

  async findAllDesignations(): Promise<Designation[]> {
    return this.designations.find({ order: { designationName: 'ASC' } });
  }

  async createDesignation(dto: CreateDesignationDto): Promise<Designation> {
    const existing = await this.designations.findOne({
      where: { designationName: dto.designationName },
    });
    if (existing) {
      throw new ConflictException(
        `Designation "${dto.designationName}" already exists`,
      );
    }
    const entity = this.designations.create({
      designationName: dto.designationName.trim(),
      releaseHours: dto.releaseHours,
    });
    return this.designations.save(entity);
  }

  async updateDesignation(
    id: string,
    dto: UpdateDesignationDto,
  ): Promise<Designation> {
    const found = await this.designations.findOne({
      where: { designationId: id },
    });
    if (!found) throw new NotFoundException('Designation not found');

    if (dto.designationName !== undefined) {
      const name = dto.designationName.trim();
      if (name !== found.designationName) {
        const clash = await this.designations.findOne({
          where: { designationName: name },
        });
        if (clash) {
          throw new ConflictException(
            `Designation "${name}" already exists`,
          );
        }
      }
      found.designationName = name;
    }
    if (dto.releaseHours !== undefined) {
      found.releaseHours = dto.releaseHours;
    }

    return this.designations.save(found);
  }

  async removeDesignation(id: string): Promise<{ success: boolean }> {
    const found = await this.designations.findOne({
      where: { designationId: id },
    });
    if (!found) throw new NotFoundException('Designation not found');
    await this.designations.remove(found);
    return { success: true };
  }
}
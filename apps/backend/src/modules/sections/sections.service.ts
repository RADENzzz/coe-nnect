import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from './entities/section.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(Section)
    private readonly repo: Repository<Section>,
  ) {}

  findAll(): Promise<Section[]> {
    return this.repo.find({
      order: { sectionCode: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Section> {
    const found = await this.repo.findOne({ where: { sectionId: id } });
    if (!found) throw new NotFoundException('Section not found');
    return found;
  }

  async create(dto: CreateSectionDto): Promise<Section> {
    const existing = await this.repo.findOne({
      where: { sectionCode: dto.sectionCode },
    });
    if (existing) {
      throw new ConflictException(
        `Section code "${dto.sectionCode}" already exists`,
      );
    }
    const entity = this.repo.create({
      sectionCode: dto.sectionCode,
      programId: dto.programId ?? null,
      yearLevel: dto.yearLevel ?? null,
      // studentCount is intentionally not set — see PM note (Oct 2026).
      // The DB column is nullable; new rows will have NULL.
    });
    return this.repo.save(entity);
  }

  async update(id: string, dto: UpdateSectionDto): Promise<Section> {
    const found = await this.findOne(id);
    if (dto.sectionCode !== undefined) found.sectionCode = dto.sectionCode;
    if (dto.programId !== undefined) found.programId = dto.programId;
    if (dto.yearLevel !== undefined) found.yearLevel = dto.yearLevel;
    // studentCount is intentionally not touched — see PM note (Oct 2026).
    return this.repo.save(found);
  }

  async toggleActive(id: string): Promise<Section> {
    const found = await this.findOne(id);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.findOne(id);
    await this.repo.remove(found);
    return { success: true };
  }
}
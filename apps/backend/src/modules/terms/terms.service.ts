import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Term } from './entities/term.entity';
import { CreateTermDto } from './dto/create-term.dto';

@Injectable()
export class TermsService {
  constructor(
    @InjectRepository(Term)
    private readonly repo: Repository<Term>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Term[]> {
    return this.repo.find({
      order: {
        isActive: 'DESC',
        startDate: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Term> {
    const found = await this.repo.findOne({ where: { termId: id } });
    if (!found) throw new NotFoundException('Term not found');
    return found;
  }

  async findActive(): Promise<Term | null> {
    return this.repo.findOne({ where: { isActive: true } });
  }

  async create(dto: CreateTermDto): Promise<Term> {
    if (dto.endDate <= dto.startDate) {
      throw new BadRequestException('endDate must be after startDate.');
    }

    const existing = await this.repo.findOne({
      where: { termName: dto.termName, schoolYear: dto.schoolYear },
    });
    if (existing) {
      throw new BadRequestException(
        `A term named "${dto.termName}" for AY ${dto.schoolYear} already exists.`,
      );
    }

    const entity = this.repo.create({
      termName: dto.termName,
      schoolYear: dto.schoolYear,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isActive: false,
    });
    const saved = await this.repo.save(entity);

    if (dto.setActive) {
      return this.activate(saved.termId);
    }
    return saved;
  }

  async activate(id: string): Promise<Term> {
    await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(Term)
        .set({ isActive: false })
        .where('is_active = :active', { active: true })
        .execute();

      await manager
        .createQueryBuilder()
        .update(Term)
        .set({ isActive: true })
        .where('term_id = :id', { id })
        .execute();
    });

    return this.findOne(id);
  }

  async deactivate(id: string): Promise<Term> {
  const found = await this.findOne(id);
  if (!found.isActive) {
    throw new BadRequestException('This term is already inactive.');
  }
  found.isActive = false;
  return this.repo.save(found);
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const found = await this.findOne(id);

    if (found.isActive) {
      throw new BadRequestException(
        'Cannot delete the active term. Activate a different term first.',
      );
    }

    await this.repo.remove(found);
    return { success: true };
  }
}
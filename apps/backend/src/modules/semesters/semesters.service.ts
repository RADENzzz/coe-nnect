import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SemesterType } from './entities/semester-type.entity';
import { CreateSemesterTypeDto } from './dto/create-semester-type.dto';
import { UpdateSemesterTypeDto } from './dto/update-semester-type.dto';
import { Term } from '../terms/entities/term.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';
import { ProspectusPdfTable } from '../prospectus-pdfs/entities/prospectus-pdf-table.entity';
import { Subject } from '../subjects/entities/subject.entity';

const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,19}$/;

/** Minimal shapes needed for usage counts while other modules still narrow the column type. */
interface SemesterReference {
  semester: string | null;
}

interface ActiveTermReference extends SemesterReference {
  termName: string;
  isActive: boolean;
}

interface ElectiveReference {
  electiveSemester: string | null;
}

export interface SemesterTypeWithUsage extends SemesterType {
  termCount: number;
  prospectusCount: number;
  pdfTableCount: number;
  electiveCount: number;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function joinCounts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

@Injectable()
export class SemestersService {
  constructor(
    @InjectRepository(SemesterType)
    private readonly repo: Repository<SemesterType>,
    @InjectRepository(Term)
    private readonly terms: Repository<ActiveTermReference>,
    @InjectRepository(Prospectus)
    private readonly prospectus: Repository<SemesterReference>,
    @InjectRepository(ProspectusPdfTable)
    private readonly pdfTables: Repository<SemesterReference>,
    @InjectRepository(Subject)
    private readonly subjects: Repository<ElectiveReference>,
  ) {}

  async findAll(): Promise<SemesterTypeWithUsage[]> {
    const types = await this.repo.find({ order: { sortOrder: 'ASC' } });
    return Promise.all(
      types.map(async (type) => ({
        ...type,
        termCount: await this.terms.count({
          where: { semester: type.code },
        }),
        prospectusCount: await this.prospectus.count({
          where: { semester: type.code },
        }),
        pdfTableCount: await this.pdfTables.count({
          where: { semester: type.code },
        }),
        electiveCount: await this.subjects.count({
          where: { electiveSemester: type.code },
        }),
      })),
    );
  }

  /** Validation for existing write paths. Deliberately allowed during an active term. */
  async assertUsable(code: string): Promise<void> {
    const type = await this.repo.findOne({ where: { code } });
    if (!type) {
      throw new BadRequestException(
        `Unknown semester type "${code}". Add it in System Settings → Academic Calendar first.`,
      );
    }
    if (!type.isActive) {
      throw new BadRequestException(
        `Semester type "${type.label}" is inactive. Activate it or choose another.`,
      );
    }
  }

  /** Catalog writes are frozen until every active term is deactivated. */
  async assertCatalogEditable(): Promise<void> {
    const activeTerm = await this.terms.findOne({ where: { isActive: true } });
    if (activeTerm) {
      throw new ConflictException(
        `Semester types are locked while "${activeTerm.termName}" is active. Deactivate it in System Settings → Academic Calendar first.`,
      );
    }
  }

  async create(dto: CreateSemesterTypeDto): Promise<SemesterType> {
    await this.assertCatalogEditable();

    const code = dto.code.trim().toLowerCase();
    if (!CODE_PATTERN.test(code)) {
      throw new BadRequestException(
        'Semester code must be 1-20 letters, digits, hyphens, or underscores, starting with a letter or digit.',
      );
    }
    if (await this.repo.findOne({ where: { code } })) {
      throw new BadRequestException(`Semester type "${code}" already exists.`);
    }

    const [last] = await this.repo.find({
      order: { sortOrder: 'DESC' },
      take: 1,
    });
    const label = dto.label.trim();
    const shortLabel = dto.shortLabel.trim();
    if (!label || !shortLabel) {
      throw new BadRequestException('Label and short label must not be blank.');
    }

    const entity = this.repo.create({
      code,
      label,
      shortLabel,
      sortOrder: dto.sortOrder ?? (last?.sortOrder ?? 0) + 10,
      isActive: true,
    });
    return this.repo.save(entity);
  }

  async update(
    code: string,
    dto: UpdateSemesterTypeDto,
  ): Promise<SemesterType> {
    await this.assertCatalogEditable();

    const type = await this.repo.findOne({ where: { code } });
    if (!type) throw new NotFoundException('Semester type not found');

    if (dto.label !== undefined) {
      const label = dto.label.trim();
      if (!label) throw new BadRequestException('Label must not be blank.');
      type.label = label;
    }
    if (dto.shortLabel !== undefined) {
      const shortLabel = dto.shortLabel.trim();
      if (!shortLabel) {
        throw new BadRequestException('Short label must not be blank.');
      }
      type.shortLabel = shortLabel;
    }
    if (dto.sortOrder !== undefined) type.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) type.isActive = dto.isActive;
    return this.repo.save(type);
  }

  async reorder(codes: string[]): Promise<SemesterType[]> {
    await this.assertCatalogEditable();

    const types = await this.repo.find();
    const byCode = new Map(types.map((type) => [type.code, type]));
    const unique = new Set(codes);
    if (
      codes.length !== types.length ||
      unique.size !== codes.length ||
      codes.some((code) => !byCode.has(code))
    ) {
      throw new BadRequestException(
        'codes must contain every semester type exactly once.',
      );
    }

    return Promise.all(
      codes.map((code, index) => {
        const type = byCode.get(code);
        type.sortOrder = (index + 1) * 10;
        return this.repo.save(type);
      }),
    );
  }

  async remove(code: string): Promise<{ success: true }> {
    await this.assertCatalogEditable();

    const type = await this.repo.findOne({ where: { code } });
    if (!type) throw new NotFoundException('Semester type not found');

    const [termCount, prospectusCount, pdfTableCount, electiveCount] =
      await Promise.all([
        this.terms.count({ where: { semester: code } }),
        this.prospectus.count({ where: { semester: code } }),
        this.pdfTables.count({ where: { semester: code } }),
        this.subjects.count({ where: { electiveSemester: code } }),
      ]);

    if (termCount || prospectusCount || pdfTableCount || electiveCount) {
      const parts: string[] = [];
      if (prospectusCount) {
        parts.push(
          `${prospectusCount} prospectus ${prospectusCount === 1 ? 'row' : 'rows'}`,
        );
      }
      if (termCount) parts.push(pluralize(termCount, 'term'));
      if (pdfTableCount) parts.push(pluralize(pdfTableCount, 'pdf table'));
      if (electiveCount) parts.push(pluralize(electiveCount, 'elective'));
      throw new BadRequestException(
        `Semester type "${code}" is used by ${joinCounts(parts)}. Deactivate it instead.`,
      );
    }

    await this.repo.remove(type);
    return { success: true };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Faculty } from '../../faculty/entities/faculty.entity';
import { Room } from '../../rooms/entities/room.entity';
import { Section } from '../../sections/entities/section.entity';
import { Subject } from '../../subjects/entities/subject.entity';
import { PublishedVersionEntry } from './term-published-version.service';

export type CatalogResult<T> = { value?: T; reason?: string; missing?: boolean };
export type ResolvedSubject = { id: string; code: string; deptId: string | null };
export type ResolvedSection = {
  section: string | null;
  sectionId: string | null;
};
export type ResolvedRoom = { roomId: string | null; externalName: string | null };
export type ResolvedFaculty = {
  facultyId: string | null;
  externalName: string | null;
};

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/**
 * Shared catalog lookups for snapshot rows. Both reuse and draft-snapshot
 * loads resolve stale snapshot ids through their code/name fallbacks before
 * deciding that a row conflicts with the current catalog.
 */
@Injectable()
export class ScheduleCatalogResolver {
  constructor(
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Room)
    private readonly roomRepo: Repository<Room>,
    @InjectRepository(Faculty)
    private readonly facultyRepo: Repository<Faculty>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
  ) {}

  async resolveSubject(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<ResolvedSubject>> {
    const id = this.optionalId(source.subject_id);
    let subject = id
      ? await this.subjectRepo.findOne({ where: { subjectId: id } })
      : null;
    if (!subject?.isActive && source.subject_code) {
      subject = await this.subjectRepo.findOne({
        where: { subjectCode: source.subject_code },
      });
    }
    if (!subject) {
      return {
        missing: true,
        reason: `Subject ${source.subject_code ?? id ?? 'unknown'} is no longer in the catalog.`,
      };
    }
    if (!subject.isActive) {
      return { reason: `Subject ${subject.subjectCode ?? id} is deactivated.` };
    }
    return {
      value: {
        id: String(subject.subjectId),
        code: subject.subjectCode ?? String(id),
        deptId: subject.deptId == null ? null : String(subject.deptId),
      },
    };
  }

  async resolveSection(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<ResolvedSection>> {
    const code = String(source.section_code ?? '').trim() || null;
    const id = this.optionalId(source.section_id);
    if (!code && !id) return { value: { section: null, sectionId: null } };

    let section = code
      ? await this.sectionRepo.findOne({ where: { sectionCode: code } })
      : null;
    if (!section?.isActive && id) {
      section = await this.sectionRepo.findOne({ where: { sectionId: id } });
    }
    if (!section?.isActive) {
      return {
        reason: `Section ${code ?? id} is no longer active in the catalog.`,
      };
    }
    return {
      value: {
        section: section.sectionCode ?? code,
        sectionId: String(section.sectionId),
      },
    };
  }

  async resolveRoom(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<ResolvedRoom>> {
    const externalName = String(source.external_room_name ?? '').trim() || null;
    const id = this.optionalId(source.room_id);
    let room = id
      ? await this.roomRepo.findOne({ where: { roomId: id } })
      : null;
    if (!room?.isActive && source.room_number) {
      room = await this.roomRepo.findOne({
        where: { roomNumber: source.room_number },
      });
    }
    if (!room?.isActive) {
      return externalName
        ? { value: { roomId: null, externalName } }
        : {
            reason:
              `Room ${source.room_number ?? id ?? 'unknown'} is no longer ` +
              'available in the catalog.',
          };
    }
    return {
      value: { roomId: String(room.roomId), externalName },
    };
  }

  async resolveFaculty(
    source: PublishedVersionEntry,
  ): Promise<CatalogResult<ResolvedFaculty>> {
    const externalName =
      String(source.external_faculty_name ?? '').trim() || null;
    const id = this.optionalId(source.faculty_id);
    if (!id) {
      return externalName
        ? { value: { facultyId: null, externalName } }
        : {
            reason:
              'The published row has no active faculty or external faculty name.',
          };
    }

    let faculty = await this.facultyRepo.findOne({ where: { facultyId: id } });
    if (!faculty?.isActive) {
      const extra = source as PublishedVersionEntry & {
        faculty_code?: string;
        employee_id?: string;
        wmsu_id?: string;
      };
      const code = extra.faculty_code ?? extra.employee_id ?? extra.wmsu_id;
      if (code) {
        faculty =
          (await this.facultyRepo.findOne({
            where: { employeeId: code },
          })) ??
          (await this.facultyRepo.findOne({ where: { wmsuId: code } })) ??
          null;
      }
      if (!faculty?.isActive && source.faculty_name) {
        const parts = source.faculty_name.trim().split(/\s+/);
        const firstName = parts.shift();
        const lastName = parts.join(' ');
        if (firstName && lastName) {
          const matches = await this.facultyRepo.find({
            where: { firstName, lastName },
          });
          faculty = matches.find((item) => item.isActive) ?? null;
        }
      }
    }
    if (!faculty) {
      return {
        reason: `Faculty ${source.faculty_name ?? id} is no longer in the catalog.`,
      };
    }
    if (!faculty.isActive) {
      return { reason: `Faculty ${source.faculty_name ?? id} is deactivated.` };
    }
    return { value: { facultyId: String(faculty.facultyId), externalName: null } };
  }

  baseKey(
    subjectId: unknown,
    sectionId: unknown,
    loadType: unknown,
  ): string {
    return [subjectId, sectionId, loadType]
      .map((part) => String(part ?? ''))
      .join('::');
  }

  dayOfWeek(value: unknown): string | null {
    return typeof value === 'string' && DAYS.includes(value) ? value : null;
  }

  clockTime(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
    return /^\d{2}:\d{2}:\d{2}$/.test(value) ? value : null;
  }

  private optionalId(value: unknown): string | null {
    return value == null || value === '' ? null : String(value);
  }
}

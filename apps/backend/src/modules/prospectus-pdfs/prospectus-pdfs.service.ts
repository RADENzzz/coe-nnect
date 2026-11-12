import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomUUID, createHash } from 'crypto';

import { ProspectusPdf } from './entities/prospectus-pdf.entity';
import {
  ColumnSliceSpec,
  ProspectusPdfTable,
  RowSpec,
} from './entities/prospectus-pdf-table.entity';
import { ProspectusStorageService } from './storage.service';
import {
  ParserRegionInput,
  ParserSubject,
  ProspectusParserClient,
} from './parser.client';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { UpdatePdfDto } from './dto/update-pdf.dto';
import { DetectTablesDto } from './dto/detect-tables.dto';
import { ImportConfirmDto } from './dto/extract.dto';

import { Subject } from '../subjects/entities/subject.entity';
import { Prospectus } from '../prospectus/entities/prospectus.entity';
import { Program } from '../programs/entities/program.entity';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';

export interface UploadedPdfFile {
  mimetype: string;
  buffer: Buffer;
  originalname: string;
  size: number;
}

interface UserProfile {
  userId: string;
  role: string;
  deptId?: string | null;
}

/**
 * Permissive subject code pattern.
 */
const SUBJECT_CODE_RE =
  /^[A-Za-z][A-Za-z0-9&.\-]{1,11}(?:\s+[A-Za-z0-9&.\-]{1,16}){0,4}$/;

/**
 * Infer the default room type for an imported subject from its unit split.
 *
 * - pure lecture   → 'lecture_room'
 * - mixed lec+lab  → 'any' (the block kind decides which room each session uses)
 * - pure lab       → 'laboratory'
 * - no units       → null
 *
 * Specialised rooms such as 'computer_lab' and 'drafting_room' are never
 * inferred: those are optional and must be chosen explicitly by the user.
 */
export function inferRoomTypeFromUnits(
  lectureUnits: number,
  labUnits: number,
): string | null {
  const hasLecture = lectureUnits > 0;
  const hasLab = labUnits > 0;
  if (hasLecture && hasLab) return 'any';
  if (hasLecture) return 'lecture_room';
  if (hasLab) return 'laboratory';
  return null;
}

@Injectable()
export class ProspectusPdfsService {
  private readonly logger = new Logger(ProspectusPdfsService.name);

  constructor(
    @InjectRepository(ProspectusPdf)
    private readonly pdfRepo: Repository<ProspectusPdf>,
    @InjectRepository(ProspectusPdfTable)
    private readonly tableRepo: Repository<ProspectusPdfTable>,
    @InjectRepository(Subject)
    private readonly subjectRepo: Repository<Subject>,
    @InjectRepository(Prospectus)
    private readonly prospectusRepo: Repository<Prospectus>,
    @InjectRepository(Program)
    private readonly programRepo: Repository<Program>,
    private readonly storage: ProspectusStorageService,
    private readonly parser: ProspectusParserClient,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  // ============================================================
  // PDFs
  // ============================================================

  async upload(
    file: UploadedPdfFile,
    user: UserProfile,
    departmentId: string,
    notes?: string,
  ): Promise<ProspectusPdf> {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted');
    }
    this.assertCanWriteDepartment(user, departmentId);

    const pdfUuid = randomUUID();

    let pageCount: number;
    let pageWidthPt: number;
    let pageHeightPt: number;
    try {
      const info = await this.getPageInfo(file.buffer);
      pageCount = info.pageCount;
      pageWidthPt = info.pageWidthPt;
      pageHeightPt = info.pageHeightPt;
    } catch (err) {
      this.logger.warn(
        `Page-info failed, using Letter defaults: ${String(err)}`,
      );
      pageCount = 1;
      pageWidthPt = 612;
      pageHeightPt = 792;
    }

    const { storagePath, bucket } = await this.storage.uploadPdf({
      departmentId,
      pdfUuid,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    const entity = this.pdfRepo.create({
      departmentId,
      originalFilename: file.originalname,
      storagePath,
      storageBucket: bucket,
      fileSizeBytes: String(file.size),
      pageCount,
      pageWidthPt: pageWidthPt.toString(),
      pageHeightPt: pageHeightPt.toString(),
      notes: notes ?? null,
      uploadedBy: user.userId,
    });
    const saved = await this.pdfRepo.save(entity);
    this.logger.log(
      `Uploaded PDF ${saved.pdfId} (${file.originalname}, ${pageCount} pages)`,
    );
    return saved;
  }

  async list(
    user: UserProfile,
    departmentId?: string,
  ): Promise<ProspectusPdf[]> {
    const where: Record<string, unknown> = { deletedAt: IsNull() };
    if (departmentId) {
      this.assertCanReadDepartment(user, departmentId);
      where.departmentId = departmentId;
    } else if (user.role === 'department_head' && user.deptId) {
      where.departmentId = String(user.deptId);
    }
    return this.pdfRepo.find({
      where,
      order: { uploadedAt: 'DESC' },
      relations: { tables: true },
    });
  }

  async findOne(id: string, user: UserProfile): Promise<ProspectusPdf> {
    const pdf = await this.pdfRepo.findOne({
      where: { pdfId: id, deletedAt: IsNull() },
      relations: { tables: true },
    });
    if (!pdf) throw new NotFoundException(`Prospectus PDF ${id} not found`);
    this.assertCanReadDepartment(user, pdf.departmentId);
    return pdf;
  }

  async update(
    id: string,
    dto: UpdatePdfDto,
    user: UserProfile,
  ): Promise<ProspectusPdf> {
    const pdf = await this.findOne(id, user);
    this.assertCanWriteDepartment(user, pdf.departmentId);

    if (dto.department_id !== undefined) {
      const newDept = String(dto.department_id);
      this.assertCanWriteDepartment(user, newDept);
      pdf.departmentId = newDept;
    }
    if (dto.original_filename !== undefined) {
      pdf.originalFilename = dto.original_filename;
    }
    if (dto.notes !== undefined) {
      pdf.notes = dto.notes;
    }
    return this.pdfRepo.save(pdf);
  }

  async remove(id: string, user: UserProfile): Promise<void> {
    const pdf = await this.findOne(id, user);
    this.assertCanWriteDepartment(user, pdf.departmentId);
    pdf.deletedAt = new Date();
    await this.pdfRepo.save(pdf);
  }

  async getSignedUrl(
    id: string,
    user: UserProfile,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    const pdf = await this.findOne(id, user);
    this.assertCanReadDepartment(user, pdf.departmentId);
    return this.storage.getSignedUrl(pdf.storagePath, 3600);
  }

  // ============================================================
  // Tables
  // ============================================================

  async createTable(
    pdfId: string,
    dto: CreateTableDto,
    user: UserProfile,
  ): Promise<ProspectusPdfTable> {
    const pdf = await this.findOne(pdfId, user);
    this.assertCanWriteDepartment(user, pdf.departmentId);

    this.assertValidColumns(dto.columns);
    this.assertValidRegion(dto);
    if (dto.rows.length > 0) {
      this.assertValidRows(dto.rows);
    }

    const tableKind = dto.table_kind ?? 'regular';

    // Regular curriculum tables are unique per year/semester. Elective tables
    // may repeat, so they skip this check.
    if (tableKind === 'regular') {
      const exists = await this.tableRepo.findOne({
        where: {
          pdfId,
          yearLevel: dto.year_level,
          semester: dto.semester,
          tableKind: 'regular',
        },
      });
      if (exists) {
        throw new ConflictException(
          `A regular table for Year ${dto.year_level} ${dto.semester} already exists for this PDF`,
        );
      }
    }

    const entity = this.tableRepo.create({
      pdfId,
      yearLevel: dto.year_level,
      semester: dto.semester,
      label: dto.label ?? null,
      tableKind,
      regionPageIndex: dto.region_page_index,
      regionXStartPt: dto.region_x_start_pt.toString(),
      regionXEndPt: dto.region_x_end_pt.toString(),
      regionYStartPt: dto.region_y_start_pt.toString(),
      regionYEndPt: dto.region_y_end_pt.toString(),
      columns: dto.columns as ColumnSliceSpec[],
      rows: dto.rows.map((r) => ({
        row_id: r.row_id,
        y_top_pt: r.y_top_pt,
        y_bottom_pt: r.y_bottom_pt,
        ...(r.cells ? { cells: r.cells } : {}),
      })) as RowSpec[],
      subjectCount: dto.rows.length,
      totalLecUnits: 0,
      totalLabUnits: 0,
      totalUnits: 0,
    });
    return this.tableRepo.save(entity);
  }

  async updateTable(
    pdfId: string,
    tableId: string,
    dto: UpdateTableDto,
    user: UserProfile,
  ): Promise<ProspectusPdfTable> {
    const pdf = await this.findOne(pdfId, user);
    this.assertCanWriteDepartment(user, pdf.departmentId);
    const table = await this.tableRepo.findOne({
      where: { tableId, pdfId },
    });
    if (!table) {
      throw new NotFoundException(
        `Table ${tableId} not found in PDF ${pdfId}`,
      );
    }

    const nextYear = dto.year_level ?? table.yearLevel;
    const nextSemester = dto.semester ?? table.semester;
    const nextKind = dto.table_kind ?? table.tableKind ?? 'regular';
    const identityChanged =
      nextYear !== table.yearLevel ||
      nextSemester !== table.semester ||
      nextKind !== table.tableKind;

    if (identityChanged && nextKind === 'regular') {
      const conflict = await this.tableRepo.findOne({
        where: {
          pdfId,
          yearLevel: nextYear,
          semester: nextSemester,
          tableKind: 'regular',
        },
      });
      if (conflict && String(conflict.tableId) !== String(tableId)) {
        throw new ConflictException(
          `A regular table for Year ${nextYear} ${nextSemester} already exists`,
        );
      }
    }

    if (dto.table_kind !== undefined) table.tableKind = dto.table_kind;
    if (nextYear !== table.yearLevel) table.yearLevel = nextYear;
    if (nextSemester !== table.semester) table.semester = nextSemester;

    if (dto.columns !== undefined) {
      this.assertValidColumns(dto.columns);
      table.columns = dto.columns as ColumnSliceSpec[];
    }

    if (dto.rows !== undefined) {
      if (dto.rows.length > 0) {
        this.assertValidRows(dto.rows);
      }
      table.rows = dto.rows.map((r) => ({
        row_id: r.row_id,
        y_top_pt: r.y_top_pt,
        y_bottom_pt: r.y_bottom_pt,
        ...(r.cells ? { cells: r.cells } : {}),
      })) as RowSpec[];
      table.subjectCount = dto.rows.length;
    }

    if (dto.region_page_index !== undefined) {
      table.regionPageIndex = dto.region_page_index;
    }
    if (dto.region_x_start_pt !== undefined) {
      table.regionXStartPt = dto.region_x_start_pt.toString();
    }
    if (dto.region_x_end_pt !== undefined) {
      table.regionXEndPt = dto.region_x_end_pt.toString();
    }
    if (dto.region_y_start_pt !== undefined) {
      table.regionYStartPt = dto.region_y_start_pt.toString();
    }
    if (dto.region_y_end_pt !== undefined) {
      table.regionYEndPt = dto.region_y_end_pt.toString();
    }
    if (dto.label !== undefined) {
      table.label = dto.label;
    }

    return this.tableRepo.save(table);
  }

  async deleteTable(
    pdfId: string,
    tableId: string,
    user: UserProfile,
  ): Promise<void> {
    const pdf = await this.findOne(pdfId, user);
    this.assertCanWriteDepartment(user, pdf.departmentId);
    const table = await this.tableRepo.findOne({
      where: { tableId, pdfId },
    });
    if (!table) throw new NotFoundException(`Table ${tableId} not found`);
    await this.tableRepo.remove(table);
  }

  // ============================================================
  // Extract
  // ============================================================

  /**
   * Ask the parser to find course tables on its own.
   *
   * Nothing is written here: proposals come back with a `status` so the
   * editor can show conflicts before the user commits. `proposalId` is only
   * stable within one response, which is all the dialog needs.
   */
  async detectTables(
    pdfId: string,
    user: UserProfile,
    dto: DetectTablesDto,
  ): Promise<{
    pageCount: number;
    proposals: {
      proposalId: string;
      pageIndex: number;
      yearLevel: number | null;
      semester: '1st' | '2nd' | 'summer' | null;
      confidence: number;
      label: string;
      headerText: string;
      signals: string[];
      regionXStartPt: number;
      regionXEndPt: number;
      regionYStartPt: number;
      regionYEndPt: number;
      columns: ColumnSliceSpec[];
      rows: RowSpec[];
      status: 'new' | 'conflict';
      existingTableId: string | null;
    }[];
    warnings: string[];
  }> {
    const pdf = await this.findOne(pdfId, user);
    this.assertCanReadDepartment(user, pdf.departmentId);

    const buffer = await this.storage.downloadPdf(pdf.storagePath);
    const result = await this.parser.detect({
      pdfBase64: buffer.toString('base64'),
      pageIndices: dto.page_indices,
      maxTables: dto.max_tables,
    });

    const existing = pdf.tables ?? [];
    const claimed = new Map<string, string>();
    const warnings = [...result.warnings];

    const proposals = result.proposals.map((proposal, index) => {
      const proposalId = `det-${proposal.page_index}-${index}`;
      const yearLevel = proposal.year_level ?? null;
      const semester = proposal.semester ?? null;
      const key =
        yearLevel != null && semester != null
          ? `${yearLevel}:${semester}`
          : null;

      const existingTable = key
        ? existing.find(
            (table) =>
              table.yearLevel === yearLevel &&
              table.semester === semester,
          )
        : undefined;
      const earlierProposal = key ? claimed.get(key) : undefined;
      if (key && !earlierProposal && !existingTable) {
        claimed.set(key, proposalId);
      }

      const conflict = !!(existingTable || earlierProposal);
      if (existingTable) {
        warnings.push(
          `Detected Year ${yearLevel} ${semester} on page ${
            proposal.page_index + 1
          }, but that table is already mapped.`,
        );
      } else if (earlierProposal) {
        warnings.push(
          `Detected Year ${yearLevel} ${semester} more than once; only the ` +
            'first proposal can be created without editing it.',
        );
      }

      return {
        proposalId,
        pageIndex: proposal.page_index,
        yearLevel,
        semester,
        confidence: proposal.confidence,
        label: proposal.label,
        headerText: proposal.header_text,
        signals: proposal.signals ?? [],
        regionXStartPt: proposal.region_x_start_pt,
        regionXEndPt: proposal.region_x_end_pt,
        regionYStartPt: proposal.region_y_start_pt,
        regionYEndPt: proposal.region_y_end_pt,
        columns: proposal.columns as ColumnSliceSpec[],
        rows: proposal.rows.map((row) => ({
          row_id: row.row_id,
          y_top_pt: row.y_top_pt,
          y_bottom_pt: row.y_bottom_pt,
        })),
        status: conflict ? ('conflict' as const) : ('new' as const),
        existingTableId: existingTable?.tableId ?? null,
      };
    });

    return {
      pageCount: result.page_count || pdf.pageCount,
      proposals,
      warnings,
    };
  }

  async extract(
    pdfId: string,
    tableIds: string[] | undefined,
    user: UserProfile,
    ocr = false,
  ): Promise<{
    regions: { table_id: string; subjects: ParserSubject[] }[];
    warnings: string[];
  }> {
    const pdf = await this.findOne(pdfId, user);
    this.assertCanReadDepartment(user, pdf.departmentId);

    const tables = pdf.tables.filter(
      (t) => !tableIds || tableIds.includes(t.tableId),
    );
    if (tables.length === 0) {
      throw new BadRequestException('No tables selected for extraction');
    }

    const buffer = await this.storage.downloadPdf(pdf.storagePath);
    const pdfBase64 = buffer.toString('base64');

    const regions: ParserRegionInput[] = tables.map((t) => ({
      table_id: Number(t.tableId),
      page_index: t.regionPageIndex,
      x_start_pt: Number(t.regionXStartPt),
      x_end_pt: Number(t.regionXEndPt),
      y_start_pt: Number(t.regionYStartPt),
      y_end_pt: Number(t.regionYEndPt),
      columns: t.columns.map((c) => ({
        role: c.role,
        x_start_pt: c.x_start_pt,
        x_end_pt: c.x_end_pt,
      })),
      rows: t.rows.map((r) => ({
        row_id: r.row_id,
        y_top_pt: r.y_top_pt,
        y_bottom_pt: r.y_bottom_pt,
        ...(r.cells ? { cells: r.cells } : {}),
      })),
    }));

    const result = await this.parser.extract({
      pdfBase64,
      regions,
      ocr,
    });

    const warnings: string[] = [];
    const regionsOut = result.regions.map((r) => {
      const table = tables.find((t) => Number(t.tableId) === r.table_id);
      const label = table
        ? `Year ${table.yearLevel} ${table.semester}`
        : `Table ${r.table_id}`;
      r.subjects.forEach((s, i) => {
        const code = (s.code ?? '').trim();
        if (!code) {
          warnings.push(
            `${label} row ${i + 1}: no code (will be imported with a placeholder)`,
          );
        } else if (!SUBJECT_CODE_RE.test(code)) {
          warnings.push(
            `${label} row ${i + 1}: "${code}" doesn't match the code pattern (will be imported as-is)`,
          );
        }
      });
      return { table_id: String(r.table_id), subjects: r.subjects };
    });

    const extractedNothing =
      regionsOut.length > 0 &&
      regionsOut.every((r) =>
        r.subjects.every(
          (s) =>
            !String(s.code ?? '').trim() && !String(s.title ?? '').trim(),
        ),
      );
    if (extractedNothing) {
      warnings.unshift(
        ocr
          ? 'OCR ran but still found no text in the selected tables. The scan may be too low-resolution, rotated, or the table edges may not line up with the text.'
          : 'No text could be extracted from the selected tables. This PDF is most likely a scan or an image-only document (e.g. a screenshot pasted into Word and exported to PDF). Try "Read with OCR", or re-export with real text — importing now would create placeholder subjects.',
      );
    }

    return { regions: regionsOut, warnings };
  }

  // ============================================================
  // Import — writes to subject + prospectus
  // ============================================================

  async confirmImport(
    pdfId: string,
    dto: ImportConfirmDto,
    user: UserProfile,
  ): Promise<{
    subjectsCreated: number;
    subjectsExisting: number;
    slotsCreated: number;
    prospectusCreated: number;
    prospectusSkipped: number;
    rowsSkipped: number;
    byTable: {
      table_id: string;
      subject_count: number;
      created: number;
      slots: number;
      skipped: number;
      existing: number;
    }[];
    warnings: string[];
    skippedRows: {
      tableId: string;
      rowIndex: number;
      code: string;
      title: string;
      reason:
        | 'no_code'
        | 'no_title'
        | 'unit_mismatch'
        | 'user_skip'
        | 'pattern_mismatch'
        | 'not_elective'
        | 'unknown_subject';
    }[];
    slots: {
      subjectId: string;
      subjectCode: string;
      slotLabel: string;
      title: string;
      yearLevel: number;
      semester: string;
      isElective: boolean;
      isPlaceholder: boolean;
      unitsMode: 'lec_lab' | 'total_only';
    }[];
    /** Elective rows that received a temporary, unresolved code. */
    temporaryCodes: {
      subjectId: string;
      subjectCode: string;
      title: string;
      yearLevel: number;
      semester: string;
    }[];
  }> {
    const pdf = await this.findOne(pdfId, user);
    this.assertCanWriteDepartment(user, pdf.departmentId);

    const programId = String(dto.program_id);
    const program = await this.programRepo.findOne({ where: { programId } });
    if (!program) throw new BadRequestException('Program not found');

    if (user.role === 'department_head') {
      if (String(program.deptId) !== String(user.deptId)) {
        throw new ForbiddenException(
          'You can only import into programs from your own department.',
        );
      }
    } else if (
      user.role !== 'administrator' &&
      user.role !== 'college_dean' &&
      user.role !== 'college_secretary'
    ) {
      throw new ForbiddenException('Insufficient role for import.');
    }

    const allTables = await this.tableRepo.find({ where: { pdfId } });
    const targetIds = new Set(dto.regions.map((r) => String(r.table_id)));
    const tables = allTables.filter((t) => targetIds.has(t.tableId));
    if (tables.length === 0) {
      throw new BadRequestException(
        `No matching tables in this PDF. ` +
          `Requested: [${[...targetIds].join(',')}], ` +
          `available: [${allTables.map((t) => t.tableId).join(',')}]`,
      );
    }

    let subjectsCreated = 0;
    let subjectsExisting = 0;
    let slotsCreated = 0;
    let prospectusCreated = 0;
    let prospectusSkipped = 0;
    let rowsSkipped = 0;
    const warnings: string[] = [];

    const hasElectiveRows = dto.regions.some((region) =>
      region.subjects.some(
        (sub) => sub.action === 'elective' || sub.action === 'slot',
      ),
    );
    if (hasElectiveRows) {
      const electiveCatalog = await this.subjectRepo.find({
        where: { isElective: true },
      });
      if (electiveCatalog.length === 0) {
        warnings.push(
          'No elective subjects exist in the catalog yet. Elective rows without a code will receive a temporary code that must be resolved before plotting or auto-generating.',
        );
      }
    }

    const skippedRows: {
      tableId: string;
      rowIndex: number;
      code: string;
      title: string;
      reason:
        | 'no_code'
        | 'no_title'
        | 'unit_mismatch'
        | 'user_skip'
        | 'pattern_mismatch'
        | 'not_elective'
        | 'unknown_subject';
    }[] = [];
    const slots: {
      subjectId: string;
      subjectCode: string;
      slotLabel: string;
      title: string;
      yearLevel: number;
      semester: string;
      isElective: boolean;
      isPlaceholder: boolean;
      unitsMode: 'lec_lab' | 'total_only';
    }[] = [];
    const temporaryCodes: {
      subjectId: string;
      subjectCode: string;
      title: string;
      yearLevel: number;
      semester: string;
    }[] = [];
    const byTable: {
      table_id: string;
      subject_count: number;
      created: number;
      slots: number;
      skipped: number;
      existing: number;
    }[] = [];

    for (const region of dto.regions) {
      const table = tables.find(
        (t) => String(t.tableId) === String(region.table_id),
      );
      if (!table) continue;

      let created = 0;
      let slotsInTable = 0;
      let skipped = 0;
      let existing = 0;

      let rowIndexInTable = 0;

      for (const sub of region.subjects) {
        const rawCode = (sub.code ?? '').trim();

        // PDF text layers frequently squash words together ("GECElective1"
        // instead of "GEC Elective 1"). Insert spaces between lower→UPPER
        // transitions and between letters and digits, so the title is legible
        // and the slot hash stays stable across re-imports.
        const title = (sub.title ?? '')
          .trim()
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/([A-Za-z])([0-9])/g, '$1 $2')
          .replace(/\s+/g, ' ');
        const action = sub.action ?? 'subject';

        // ── User explicitly skipped this row ──
        if (action === 'skip') {
          skipped++;
          rowsSkipped++;
          skippedRows.push({
            tableId: String(table.tableId),
            rowIndex: rowIndexInTable,
            code: rawCode,
            title,
            reason: 'user_skip',
          });
          rowIndexInTable++;
          continue;
        }

        // Title is mandatory in every action — a slot with no label is meaningless.
        if (!title) {
          skipped++;
          rowsSkipped++;
          skippedRows.push({
            tableId: String(table.tableId),
            rowIndex: rowIndexInTable,
            code: rawCode,
            title,
            reason: 'no_title',
          });
          rowIndexInTable++;
          continue;
        }

        const parsedLec = this.parseIntSafe(sub.lec);
        const parsedLab = this.parseIntSafe(sub.lab);
        const parsedTotal = this.parseIntSafe(sub.total);

        const isElectiveAction = action === 'elective' || action === 'slot';

        // Electives may list only a total. `total_only` keeps the breakdown
        // columns at zero and is the only mode allowed to skip the
        // lec+lab=total check.
        const unitsMode: 'lec_lab' | 'total_only' = isElectiveAction
          ? (sub.units_mode ??
            (parsedLec === 0 && parsedLab === 0 && parsedTotal > 0
              ? 'total_only'
              : 'lec_lab'))
          : 'lec_lab';

        let lec = parsedLec;
        let lab = parsedLab;
        let total = parsedTotal;

        if (unitsMode === 'total_only') {
          if (total <= 0) {
            skipped++;
            rowsSkipped++;
            skippedRows.push({
              tableId: String(table.tableId),
              rowIndex: rowIndexInTable,
              code: rawCode || '(none)',
              title,
              reason: 'unit_mismatch',
            });
            warnings.push(
              `Year ${table.yearLevel} ${table.semester}: "${rawCode || title}" is total-only but has no total units.`,
            );
            rowIndexInTable++;
            continue;
          }
          lec = 0;
          lab = 0;
        } else if (
          lec + lab !== total &&
          (action === 'subject' || action === 'elective')
        ) {
          skipped++;
          rowsSkipped++;
          skippedRows.push({
            tableId: String(table.tableId),
            rowIndex: rowIndexInTable,
            code: rawCode || '(none)',
            title,
            reason: 'unit_mismatch',
          });
          warnings.push(
            `Year ${table.yearLevel} ${table.semester}: "${rawCode || title}" lec+lab≠total (${lec}+${lab}≠${total})`,
          );
          rowIndexInTable++;
          continue;
        }

        // ── Elective path ('elective', plus the legacy 'slot' alias) ──
        if (isElectiveAction) {
          let subject: Subject | null = null;
          let usedTemporaryCode = false;

          // Legacy 'slot' rows always use a placeholder code, ignoring any
          // code text. New 'elective' rows may reference an existing subject.
          if (action === 'elective' && sub.subject_id != null) {
            subject = await this.subjectRepo.findOne({
              where: { subjectId: String(sub.subject_id) },
            });
            if (!subject || !subject.isActive) {
              skipped++;
              rowsSkipped++;
              skippedRows.push({
                tableId: String(table.tableId),
                rowIndex: rowIndexInTable,
                code: rawCode || '(none)',
                title,
                reason: 'unknown_subject',
              });
              warnings.push(
                `Year ${table.yearLevel} ${table.semester}: "${title}" references an elective subject that no longer exists.`,
              );
              rowIndexInTable++;
              continue;
            }
            if (!subject.isElective) {
              skipped++;
              rowsSkipped++;
              skippedRows.push({
                tableId: String(table.tableId),
                rowIndex: rowIndexInTable,
                code: subject.subjectCode,
                title,
                reason: 'not_elective',
              });
              warnings.push(
                `Year ${table.yearLevel} ${table.semester}: "${subject.subjectCode}" is not an elective subject.`,
              );
              rowIndexInTable++;
              continue;
            }
          } else if (action === 'elective' && rawCode) {
            subject = await this.subjectRepo.findOne({
              where: { subjectCode: rawCode },
            });
            if (subject && !subject.isElective) {
              skipped++;
              rowsSkipped++;
              skippedRows.push({
                tableId: String(table.tableId),
                rowIndex: rowIndexInTable,
                code: rawCode,
                title,
                reason: 'not_elective',
              });
              warnings.push(
                `Year ${table.yearLevel} ${table.semester}: "${rawCode}" is a regular subject; choose an elective or use a new code.`,
              );
              rowIndexInTable++;
              continue;
            }
            if (!subject) {
              const created = await this.createElectiveSubject({
                table,
                title,
                lec,
                lab,
                total,
                deptId: pdf.departmentId,
                unitsMode,
                code: rawCode,
                isPlaceholder: false,
                rowIndex: rowIndexInTable,
              });
              subject = created.subject;
              if (created.created) subjectsCreated++;
            }
          } else {
            const created = await this.createElectiveSubject({
              table,
              title,
              lec,
              lab,
              total,
              deptId: pdf.departmentId,
              unitsMode,
              isPlaceholder: true,
              rowIndex: rowIndexInTable,
              legacySlot: action === 'slot',
            });
            subject = created.subject;
            if (created.created) subjectsCreated++;
            usedTemporaryCode = true;
          }

          slotsCreated++;
          slotsInTable++;
          slots.push({
            subjectId: subject.subjectId,
            subjectCode: subject.subjectCode,
            slotLabel: title,
            title,
            yearLevel: table.yearLevel,
            semester: table.semester,
            isElective: true,
            isPlaceholder: subject.isPlaceholder,
            unitsMode,
          });

          if (usedTemporaryCode) {
            temporaryCodes.push({
              subjectId: subject.subjectId,
              subjectCode: subject.subjectCode,
              title,
              yearLevel: table.yearLevel,
              semester: table.semester,
            });
            warnings.push(
              `Year ${table.yearLevel} ${table.semester}: "${title}" imported with temporary code ${subject.subjectCode}. Resolve it before plotting or auto-generating.`,
            );
          }

          await this.upsertProspectusRow({
            programId,
            subjectId: subject.subjectId,
            table,
            slotLabel: title,
          });
          prospectusCreated++;
          created++;
          rowIndexInTable++;
          continue;
        }

        // ── Normal 'subject' path ──
        if (!rawCode) {
          skipped++;
          rowsSkipped++;
          skippedRows.push({
            tableId: String(table.tableId),
            rowIndex: rowIndexInTable,
            code: '(none)',
            title,
            reason: 'no_code',
          });
          rowIndexInTable++;
          continue;
        }

        let code = rawCode;
        if (!SUBJECT_CODE_RE.test(rawCode)) {
          code = rawCode.toUpperCase();
          warnings.push(
            `Year ${table.yearLevel} ${table.semester}: "${rawCode}" doesn't match the code pattern but was imported as "${code}". Verify the code.`,
          );
        }

        const inferredRoomType = inferRoomTypeFromUnits(lec, lab);

        let subject = await this.subjectRepo.findOne({
          where: { subjectCode: code },
        });

        if (!subject) {
          subject = this.subjectRepo.create({
            subjectCode: code,
            title,
            totalUnits: total,
            lectureUnits: lec,
            labUnits: lab,
            deptId: pdf.departmentId,
            isActive: true,
            isMinor: false,
            isPlaceholder: false,
            isElective: false,
            unitsMode: 'lec_lab',
            requiredRoomType: inferredRoomType,
          });
          subject = await this.subjectRepo.save(subject);
          subjectsCreated++;
        } else {
          // Backfill a missing room type from the unit split. A mixed
          // subject also replaces a stale auto-inferred basic type, but
          // specialised types the user chose (computer_lab, drafting_room,
          // other) are never overwritten.
          const current = subject.requiredRoomType ?? null;
          const isStaleBasicType =
            inferredRoomType === 'any' &&
            (current === 'lecture_room' || current === 'laboratory');
          if (
            inferredRoomType !== null &&
            (current === null || isStaleBasicType)
          ) {
            subject.requiredRoomType = inferredRoomType;
            await this.subjectRepo.save(subject);
          }
          subjectsExisting++;
        }

        const outcome = await this.upsertProspectusRow({
          programId,
          subjectId: subject.subjectId,
          table,
        });
        if (outcome.created) {
          prospectusCreated++;
          created++;
        } else {
          prospectusSkipped++;
          existing++;
        }

        rowIndexInTable++;
      }

      table.subjectCount = region.subjects.length;
      await this.tableRepo.save(table);

      byTable.push({
        table_id: String(table.tableId),
        subject_count: region.subjects.length,
        created,
        slots: slotsInTable,
        skipped,
        existing,
      });
    }

    this.logger.log(
      `Import complete for PDF ${pdfId}: ` +
        `${subjectsCreated} new subjects, ${slotsCreated} elective subjects, ` +
        `${prospectusCreated} prospectus rows, ` +
        `${prospectusSkipped} skipped, ${rowsSkipped} invalid`,
    );

    const totalProcessed = prospectusCreated + prospectusSkipped;
    await this.dispatcher.dispatch('prospectus.imported', {
      recipientUserIds: [user.userId],
      title: `Prospectus imported: ${program.programCode}`,
      body:
        `${pdf.originalFilename} — ` +
        `imported ${prospectusCreated} prospectus entr${prospectusCreated === 1 ? 'y' : 'ies'}` +
        (subjectsCreated > 0
          ? `, created ${subjectsCreated} new subject${subjectsCreated === 1 ? '' : 's'}`
          : '') +
        (slotsCreated > 0
          ? `, ${slotsCreated} elective slot${slotsCreated === 1 ? '' : 's'}`
          : '') +
        (rowsSkipped > 0
          ? `. ${rowsSkipped} row${rowsSkipped === 1 ? '' : 's'} skipped.`
          : '.'),
      entityType: 'prospectus_pdf',
      entityId: String(pdfId),
      payload: {
        programId,
        programCode: program.programCode,
        programName: program.programName,
        fileName: pdf.originalFilename,
        departmentId: String(pdf.departmentId),
        subjectsCreated,
        subjectsExisting,
        slotsCreated,
        prospectusCreated,
        prospectusSkipped,
        rowsSkipped,
        totalProcessed,
        byTable,
      },
    });

    return {
      subjectsCreated,
      subjectsExisting,
      slotsCreated,
      prospectusCreated,
      prospectusSkipped,
      rowsSkipped,
      byTable,
      warnings,
      skippedRows,
      slots,
      temporaryCodes,
    };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async getPageInfo(
    pdfBuffer: Buffer,
  ): Promise<{
    pageCount: number;
    pageWidthPt: number;
    pageHeightPt: number;
  }> {
    const pdfBase64 = pdfBuffer.toString('base64');
    const info = await this.parser.getPageInfo(pdfBase64);
    const first = info.page_sizes_pt[0];
    return {
      pageCount: info.page_count,
      pageWidthPt: first?.width_pt ?? 612,
      pageHeightPt: first?.height_pt ?? 792,
    };
  }

  private assertValidColumns(cols: { role: string }[]): void {
    if (cols.length !== 6) {
      throw new BadRequestException(
        'columns must contain exactly 6 entries',
      );
    }
    const roles = new Set(cols.map((c) => c.role));
    const required = ['code', 'title', 'prereq', 'lec', 'lab', 'total'];
    for (const r of required) {
      if (!roles.has(r)) {
        throw new BadRequestException(`columns missing role: ${r}`);
      }
    }
  }

  private assertValidRegion(dto: {
    region_x_start_pt: number;
    region_x_end_pt: number;
    region_y_start_pt: number;
    region_y_end_pt: number;
  }): void {
    if (dto.region_x_end_pt <= dto.region_x_start_pt) {
      throw new BadRequestException(
        'region_x_end_pt must exceed region_x_start_pt',
      );
    }
    if (dto.region_y_end_pt <= dto.region_y_start_pt) {
      throw new BadRequestException(
        'region_y_end_pt must exceed region_y_start_pt',
      );
    }
  }

  private async createElectiveSubject(params: {
    table: ProspectusPdfTable;
    title: string;
    lec: number;
    lab: number;
    total: number;
    deptId: string;
    unitsMode: 'lec_lab' | 'total_only';
    code?: string;
    isPlaceholder: boolean;
    rowIndex: number;
    legacySlot?: boolean;
  }): Promise<{ subject: Subject; created: boolean }> {
    const code =
      params.code?.trim() ||
      this.makeTemporaryElectiveCode({
        table: params.table,
        title: params.title,
        rowIndex: params.rowIndex,
        legacySlot: params.legacySlot ?? false,
      });

    const existing = await this.subjectRepo.findOne({
      where: { subjectCode: code },
    });
    if (existing) return { subject: existing, created: false };

    const subject = this.subjectRepo.create({
      subjectCode: code,
      title: params.title,
      totalUnits: params.total,
      lectureUnits: params.lec,
      labUnits: params.lab,
      deptId: params.deptId,
      isActive: true,
      isMinor: false,
      isPlaceholder: params.isPlaceholder,
      isElective: true,
      unitsMode: params.unitsMode,
      requiredRoomType: inferRoomTypeFromUnits(params.lec, params.lab),
    });
    return { subject: await this.subjectRepo.save(subject), created: true };
  }

  /**
   * Deterministic temporary code so re-importing the same PDF is idempotent.
   *
   * Legacy `slot` rows keep the old title-only hash (`SLOT-…`). New elective
   * rows include the table and row index (`ELEC-…`) so two electives with the
   * same title in one semester remain distinct.
   */
  private makeTemporaryElectiveCode(params: {
    table: ProspectusPdfTable;
    title: string;
    rowIndex: number;
    legacySlot: boolean;
  }): string {
    const sem =
      params.table.semester === '1st'
        ? '1'
        : params.table.semester === '2nd'
        ? '2'
        : 'S';
    const hashInput = params.legacySlot
      ? params.title.toLowerCase().trim()
      : `${params.title.toLowerCase().trim()}|${params.table.tableId}|${params.rowIndex}`;
    const hash = createHash('sha1')
      .update(hashInput)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
    const prefix = params.legacySlot ? 'SLOT' : 'ELEC';
    return `${prefix}-Y${params.table.yearLevel}S${sem}-${hash}`;
  }

  private async upsertProspectusRow(params: {
    programId: string;
    subjectId: string;
    table: ProspectusPdfTable;
    slotLabel?: string;
  }): Promise<{ created: boolean }> {
    const existing = await this.prospectusRepo.findOne({
      where: {
        programId: params.programId,
        subjectId: params.subjectId,
        yearLevel: params.table.yearLevel,
        semester: params.table.semester,
      },
    });

    if (existing) {
      if (!existing.isActive) {
        // Don't resurrect a mapping whose subject is inactive — that would
        // bypass the subject-level deactivation cascade.
        const subject = await this.subjectRepo.findOne({
          where: { subjectId: params.subjectId },
        });
        if (subject?.isActive) {
          existing.isActive = true;
          existing.deactivatedBySubject = false;
          if (params.slotLabel !== undefined) {
            existing.slotLabel = params.slotLabel;
          }
          await this.prospectusRepo.save(existing);
          return { created: true };
        }
        return { created: false };
      }
      if (
        params.slotLabel !== undefined &&
        existing.slotLabel !== params.slotLabel
      ) {
        existing.slotLabel = params.slotLabel;
        await this.prospectusRepo.save(existing);
      }
      return { created: false };
    }

    const entry = this.prospectusRepo.create({
      programId: params.programId,
      subjectId: params.subjectId,
      yearLevel: params.table.yearLevel,
      semester: params.table.semester,
      slotLabel: params.slotLabel ?? null,
      isActive: true,
      lectureSessionsPerWeek: 1,
      lectureMinutesPerSession: 90,
      labSessionsPerWeek: 1,
      labMinutesPerSession: 180,
    });
    await this.prospectusRepo.save(entry);
    return { created: true };
  }

  private assertValidRows(
    rows: { y_top_pt: number; y_bottom_pt: number }[],
  ): void {
    for (const r of rows) {
      if (r.y_bottom_pt >= r.y_top_pt) {
        throw new BadRequestException(
          'Each row must have y_bottom_pt < y_top_pt',
        );
      }
    }
  }

  private parseIntSafe(v: string | undefined): number {
    if (!v) return 0;
    const cleaned = String(v).replace(/[^0-9.-]/g, '');
    if (!cleaned || cleaned === '.' || cleaned === '-') return 0;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  private assertCanReadDepartment(
    user: UserProfile,
    deptId: string,
  ): void {
    if (
      user.role === 'administrator' ||
      user.role === 'college_dean' ||
      user.role === 'college_secretary'
    ) {
      return;
    }
    if (user.role === 'department_head') {
      if (user.deptId && String(user.deptId) === String(deptId)) return;
      throw new ForbiddenException('Not your department');
    }
    throw new ForbiddenException('Insufficient role');
  }

  private assertCanWriteDepartment(
    user: UserProfile,
    deptId: string,
  ): void {
    this.assertCanReadDepartment(user, deptId);
  }
}
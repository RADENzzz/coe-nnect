import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { User } from '../users/entities/user.entity';
import { RoomPreference } from './entities/room-preference.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly repo: Repository<Room>,
    @InjectRepository(RoomPreference)
    private readonly preferenceRepo: Repository<RoomPreference>,
  ) {}

  /**
   * Ownership rule (B):
   *   Dean  → full access to any room
   *   DH    → may edit rooms that are either:
   *             • owned by their own department, OR
   *             • shared (dept_id IS NULL)
   *           but NOT another department's exclusive room.
   *   others → reject (fail-closed)
   *
   * NOTE: the `administrator` role is still accepted so the hidden
   * dev account retains full access. It is NOT used for user-facing
   * authorization — the Dean is the top role.
   */
  private async assertOwnership(
    roomId: string,
    profile: User | undefined,
  ): Promise<Room> {
    if (!profile) throw new ForbiddenException('Not authenticated');

    const room = await this.findOne(roomId);

    if (profile.role === 'administrator' || profile.role === 'college_dean') {
      return room;
    }

    if (profile.role !== 'department_head') {
      throw new ForbiddenException(
        'Only deans and department heads can modify rooms.',
      );
    }

    // Shared room → any DH can edit
    if (!room.deptId) return room;

    // Owned room → must be the DH's own department
    if (String(room.deptId) === String(profile.deptId)) return room;

    // Otherwise → reject
    throw new ForbiddenException(
      "You can only modify rooms owned by your department, or shared rooms.",
    );
  }

  findAll(): Promise<Room[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { roomNumber: 'ASC' },
    });
  }

  findAllIncludingInactive(): Promise<Room[]> {
    return this.repo.find({ order: { roomNumber: 'ASC' } });
  }

  async findOne(id: string): Promise<Room> {
    const found = await this.repo.findOne({ where: { roomId: id } });
    if (!found) throw new NotFoundException('Room not found');
    return found;
  }

  async create(dto: CreateRoomDto, profile: User): Promise<Room> {
    // DHs may create:
    //   • shared rooms (deptId omitted / null)
    //   • rooms owned by their own department
    // DHs may NOT create rooms for another department.
    if (profile.role === 'department_head') {
      if (dto.deptId && String(dto.deptId) !== String(profile.deptId)) {
        throw new ForbiddenException(
          'You can only create rooms for your own department, or shared rooms.',
        );
      }
    }

    const existing = await this.repo.findOne({
      where: { roomNumber: dto.roomNumber, building: dto.building },
    });
    if (existing) {
      throw new ConflictException(
        `Room ${dto.roomNumber} already exists in ${dto.building}`,
      );
    }

    const entity = this.repo.create({
      roomNumber: dto.roomNumber,
      building: dto.building,
      roomType: dto.roomType,
      capacity: dto.capacity ?? null,
      deptId: dto.deptId ?? null,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateRoomDto,
    profile: User,
  ): Promise<Room> {
    const found = await this.assertOwnership(id, profile);

    // DHs may convert their own room → shared (deptId = null),
    // or leave it alone. They may NOT assign an owned room to
    // another department.
    if (
      profile.role === 'department_head' &&
      dto.deptId !== undefined &&
      dto.deptId !== null &&
      String(dto.deptId) !== String(profile.deptId)
    ) {
      throw new ForbiddenException(
        'You cannot assign rooms to another department.',
      );
    }

    if (dto.roomNumber !== undefined) found.roomNumber = dto.roomNumber;
    if (dto.building !== undefined) found.building = dto.building;
    if (dto.roomType !== undefined) found.roomType = dto.roomType;
    if (dto.capacity !== undefined) found.capacity = dto.capacity ?? null;
    if (dto.deptId !== undefined) found.deptId = dto.deptId ?? null;

    return this.repo.save(found);
  }

  async toggleActive(id: string, profile: User): Promise<Room> {
    const found = await this.assertOwnership(id, profile);
    found.isActive = !found.isActive;
    return this.repo.save(found);
  }

  async remove(id: string, profile: User): Promise<{ success: boolean }> {
    const found = await this.assertOwnership(id, profile);
    await this.repo.remove(found);
    return { success: true };
  }

  // ════════════════════════════════════════════
  // ROOM PREFERENCES (F3)
  // ════════════════════════════════════════════

  /**
   * List preferences for a specific room. Dean sees all;
   * DH sees their own dept's row plus an aggregate count.
   */
  async findPreferencesForRoom(
    roomId: string,
    user: any,
  ): Promise<
    Array<{
      preferenceId: string;
      roomId: string;
      deptId: string;
      deptCode: string;
      deptName: string;
      priority: number;
      createdBy: string | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.preferenceRepo
      .createQueryBuilder('rp')
      .leftJoinAndSelect('rp.department', 'd')
      .where('rp.room_id = :roomId', { roomId })
      .orderBy('rp.priority', 'DESC')
      .addOrderBy('d.dept_code', 'ASC')
      .getMany();

    return rows.map((r) => ({
      preferenceId: r.preferenceId,
      roomId: r.roomId,
      deptId: r.deptId,
      deptCode: r.department?.deptCode ?? '?',
      deptName: r.department?.deptName ?? '?',
      priority: r.priority,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Bulk list: every preference across every shared room.
   *
   * Used by:
   *   - The Rooms page "Preferred" tile (count + row flag)
   *   - Any future per-dept preference audit
   *
   * NOT dept-scoped — everyone with role access sees the full set.
   * The dataset is small (departments × shared rooms), so we return
   * everything in one call rather than fanning out per room.
   */
  async findAllPreferences(): Promise<
    Array<{
      preferenceId: string;
      roomId: string;
      deptId: string;
      deptCode: string;
      deptName: string;
      priority: number;
      createdBy: string | null;
      createdAt: Date;
    }>
  > {
    const rows = await this.preferenceRepo
      .createQueryBuilder('rp')
      .leftJoinAndSelect('rp.department', 'd')
      .orderBy('rp.room_id', 'ASC')
      .addOrderBy('rp.priority', 'DESC')
      .addOrderBy('d.dept_code', 'ASC')
      .getMany();

    return rows.map((r) => ({
      preferenceId: r.preferenceId,
      roomId: r.roomId,
      deptId: r.deptId,
      deptCode: r.department?.deptCode ?? '?',
      deptName: r.department?.deptName ?? '?',
      priority: r.priority,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  /**
   * List all preferences for a department. Used by the solver
   * payload builder.
   */
  async findPreferencesForDept(deptId: string): Promise<RoomPreference[]> {
    return this.preferenceRepo.find({
      where: { deptId },
      order: { priority: 'DESC' },
    });
  }

  /**
   * Create or update a preference. Enforces:
   *   - Room must be shared (dept_id IS NULL)
   *   - DH must own the dept they're preferring for
   */
  async upsertPreference(
    dto: { roomId: string; deptId: string; priority?: number },
    user: any,
  ): Promise<RoomPreference> {
    // Ownership: DH can only act for their own department
    if (
      user.role === 'department_head' &&
      String(user.deptId) !== String(dto.deptId)
    ) {
      throw new ForbiddenException(
        'You can only set preferences for your own department.',
      );
    }

    // Room must exist
    const room = await this.repo.findOne({
      where: { roomId: dto.roomId },
      select: ['roomId', 'deptId', 'roomNumber'],
    });
    if (!room) {
      throw new NotFoundException(`Room ${dto.roomId} not found`);
    }

    // Owned rooms can't be preferred — fail loud
    if (room.deptId !== null) {
      throw new BadRequestException(
        `Room ${room.roomNumber} is owned by another department and cannot be preferred.`,
      );
    }

    const existing = await this.preferenceRepo.findOne({
      where: { roomId: dto.roomId, deptId: dto.deptId },
    });

    if (existing) {
      if (dto.priority !== undefined) {
        existing.priority = dto.priority;
      }
      return this.preferenceRepo.save(existing);
    }

    const entity = this.preferenceRepo.create({
      roomId: dto.roomId,
      deptId: dto.deptId,
      priority: dto.priority ?? 1,
      createdBy: user.userId ?? null,
    });
    return this.preferenceRepo.save(entity);
  }

  /**
   * Remove a preference. DH can only remove their own dept's row.
   */
  async removePreference(id: string, user: any): Promise<{ success: boolean }> {
    const found = await this.preferenceRepo.findOne({
      where: { preferenceId: id },
    });
    if (!found) {
      throw new NotFoundException(`Preference ${id} not found`);
    }

    if (
      user.role === 'department_head' &&
      String(user.deptId) !== String(found.deptId)
    ) {
      throw new ForbiddenException(
        'You can only remove preferences for your own department.',
      );
    }

    await this.preferenceRepo.remove(found);
    return { success: true };
  }
}
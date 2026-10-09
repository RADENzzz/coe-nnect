import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly repo: Repository<Room>,
  ) {}

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
        'Only administrators, deans, and department heads can modify rooms.',
      );
    }

    // Null dept_id = shared room. DHs may NOT mutate shared rooms.
    if (!room.deptId || String(room.deptId) !== String(profile.deptId)) {
      throw new ForbiddenException(
        'You can only modify rooms owned by your own department.',
      );
    }

    return room;
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
    // DHs can only create rooms owned by their department.
    if (profile.role === 'department_head') {
      if (dto.deptId && String(dto.deptId) !== String(profile.deptId)) {
        throw new ForbiddenException(
          'You can only create rooms owned by your own department.',
        );
      }
      dto.deptId = String(profile.deptId);
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

    // DHs cannot move rooms to a different department.
    if (
      profile.role === 'department_head' &&
      dto.deptId !== undefined &&
      dto.deptId !== null &&
      String(dto.deptId) !== String(profile.deptId)
    ) {
      throw new ForbiddenException(
        'You cannot move rooms to a different department.',
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
}
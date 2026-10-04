import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room } from './entities/room.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly repo: Repository<Room>,
  ) {}

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

  async create(dto: CreateRoomDto): Promise<Room> {
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

  async update(id: string, dto: UpdateRoomDto): Promise<Room> {
    const found = await this.findOne(id);

    if (dto.roomNumber !== undefined) found.roomNumber = dto.roomNumber;
    if (dto.building !== undefined) found.building = dto.building;
    if (dto.roomType !== undefined) found.roomType = dto.roomType;
    if (dto.capacity !== undefined) found.capacity = dto.capacity ?? null;
    if (dto.deptId !== undefined) found.deptId = dto.deptId ?? null;

    return this.repo.save(found);
  }

  async toggleActive(id: string): Promise<Room> {
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
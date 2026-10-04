import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Faculty } from './entities/faculty.entity';

@Injectable()
export class FacultyService {
  constructor(
    @InjectRepository(Faculty)
    private readonly repo: Repository<Faculty>,
  ) {}

  findAll(): Promise<Faculty[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Faculty> {
    const found = await this.repo.findOne({ where: { facultyId: id } });
    if (!found) throw new Error('Faculty not found');
    return found;
  }
}
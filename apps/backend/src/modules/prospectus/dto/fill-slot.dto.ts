import { IsString } from 'class-validator';

export class FillSlotDto {
  @IsString()
  subjectId!: string;
}
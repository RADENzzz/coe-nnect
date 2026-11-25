import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderSemesterTypesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  codes!: string[];
}

import { IsString, IsNotEmpty } from 'class-validator';

export class CompareVersionsDto {
  @IsString()
  @IsNotEmpty()
  versionAId!: string;

  @IsString()
  @IsNotEmpty()
  versionBId!: string;
}
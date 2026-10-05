import { PartialType } from '@nestjs/mapped-types';
import { CreateProspectusDto } from './create-prospectus.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateProspectusDto extends PartialType(CreateProspectusDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
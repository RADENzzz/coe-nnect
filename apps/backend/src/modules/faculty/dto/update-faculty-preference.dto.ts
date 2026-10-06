import { PartialType } from '@nestjs/mapped-types';
import { CreateFacultyPreferenceDto } from './create-faculty-preference.dto';

export class UpdateFacultyPreferenceDto extends PartialType(
  CreateFacultyPreferenceDto,
) {}
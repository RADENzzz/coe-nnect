import { PartialType } from '@nestjs/mapped-types';
import { CreateFacultyUnavailabilityDto } from './create-faculty-unavailability.dto';

export class UpdateFacultyUnavailabilityDto extends PartialType(
  CreateFacultyUnavailabilityDto,
) {}
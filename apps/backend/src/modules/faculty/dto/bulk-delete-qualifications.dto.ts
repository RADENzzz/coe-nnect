import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumberString,
} from 'class-validator';

export class BulkDeleteQualificationsDto {
  /** Qualification ids (bigint columns, sent as strings). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsNumberString({}, { each: true })
  qualIds: string[];
}

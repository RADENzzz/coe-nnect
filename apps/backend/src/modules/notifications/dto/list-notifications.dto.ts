import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const CATEGORIES = [
  'schedule',
  'approvals',
  'scheduling',
  'academic',
  'faculty',
  'facility',
  'admin',
] as const;

export class ListNotificationsDto {
  /** Page size. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 30;

  /** Cursor for pagination — ISO timestamp; returns notifications strictly older. */
  @IsString()
  @IsOptional()
  before?: string;

  /** Filter by category. */
  @IsIn(CATEGORIES)
  @IsOptional()
  category?: string;

  /** Filter by read/unread. */
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isRead?: boolean;

  /** Free-text search in title + body (ILIKE). */
  @IsString()
  @IsOptional()
  search?: string;
}
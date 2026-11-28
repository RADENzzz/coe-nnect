import { Equals, IsNumberString, IsString, Length } from 'class-validator';

/** Save the current draft/review timetable as a named term snapshot. */
export class SaveDraftSnapshotDto {
  @IsNumberString()
  termId: string;

  @IsNumberString()
  deptId: string;

  @IsString()
  @Length(1, 120)
  name: string;
}

/** Read-only preflight of a saved snapshot into a term/department. */
export class DraftSnapshotTargetDto {
  @IsNumberString()
  termId: string;

  @IsNumberString()
  deptId: string;
}

/** Loading a draft snapshot always requires an explicit confirmation. */
export class ApplyDraftSnapshotDto extends DraftSnapshotTargetDto {
  @Equals(true)
  confirmed: boolean;
}

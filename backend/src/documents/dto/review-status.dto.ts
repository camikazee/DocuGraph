import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SetReviewStatusDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  path: string;

  @IsIn(['in_review', 'approved', 'changes_requested'])
  status: 'in_review' | 'approved' | 'changes_requested';
}

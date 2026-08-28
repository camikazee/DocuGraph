import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class ContentAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  days: 7 | 30 | 90 = 30;
}

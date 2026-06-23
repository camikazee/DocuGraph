import { IsString, MinLength } from 'class-validator';

export class FixBrokenLinkDto {
  @IsString()
  @MinLength(1)
  from: string;

  @IsString()
  @MinLength(1)
  to: string;
}

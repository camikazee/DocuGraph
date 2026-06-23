import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ReadEventDto {
  @IsString()
  @MinLength(1)
  path: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3_600_000)
  durationMs?: number;
}

export class WatchDto {
  @IsString()
  @MinLength(1)
  path: string;

  @IsBoolean()
  on: boolean;
}

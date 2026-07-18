import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AddCommentDto {
  @IsString()
  @MinLength(1)
  path: string;

  @IsInt()
  @Min(0)
  line: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  quote?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  /** Publiczne uuid wzmiankowanych członków workspace (z autouzupełniania). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  mentions?: string[];
}

export class ResolveCommentDto {
  @IsString()
  @MinLength(1)
  path: string;

  @IsInt()
  @Min(0)
  line: number;

  @IsBoolean()
  resolved: boolean;
}

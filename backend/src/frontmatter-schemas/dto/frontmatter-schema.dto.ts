import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const FRONTMATTER_FIELD_TYPES = [
  'text',
  'number',
  'boolean',
  'date',
  'select',
  'list',
] as const;

export type FrontmatterFieldType = (typeof FRONTMATTER_FIELD_TYPES)[number];

export interface FrontmatterFieldDto {
  key: string;
  label: string;
  type: FrontmatterFieldType;
  required: boolean;
  options: string[];
  defaultValue: string;
}

export interface FrontmatterSchemaDto {
  id: string;
  name: string;
  description: string;
  fields: FrontmatterFieldDto[];
  builtIn: boolean;
}

export class FrontmatterFieldInputDto implements FrontmatterFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @IsIn(FRONTMATTER_FIELD_TYPES)
  type: FrontmatterFieldType;

  @IsBoolean()
  required: boolean;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  options: string[];

  @IsString()
  @MaxLength(500)
  defaultValue: string;
}

export class CreateFrontmatterSchemaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => FrontmatterFieldInputDto)
  fields: FrontmatterFieldInputDto[];
}

export class UpdateFrontmatterSchemaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => FrontmatterFieldInputDto)
  fields?: FrontmatterFieldInputDto[];
}

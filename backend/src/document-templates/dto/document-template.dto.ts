import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  suggestedPath: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000_000)
  contentRaw: string;
}

export class UpdateDocumentTemplateDto {
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
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  suggestedPath?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1_000_000)
  contentRaw?: string;
}

export interface DocumentTemplateDto {
  id: string;
  name: string;
  description: string;
  suggestedPath: string;
  contentRaw: string;
  builtIn: boolean;
}

import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentSnippetDto {
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
  @MaxLength(1_000_000)
  contentRaw: string;
}

export class UpdateDocumentSnippetDto {
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
  @MaxLength(1_000_000)
  contentRaw?: string;
}

export interface DocumentSnippetDto {
  id: string;
  name: string;
  description: string;
  contentRaw: string;
  builtIn: boolean;
}

import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SourceDto {
  @IsOptional()
  @IsIn(['github'])
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  repo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  root?: string;

  @IsOptional()
  @IsBoolean()
  realtimeWebhooks?: boolean;

  @IsOptional()
  @IsBoolean()
  bidirectional?: boolean;

  @IsOptional()
  @IsBoolean()
  enforceTemplates?: boolean;

  /** Zdalne repo do „Publish to Git" (np. authenticated HTTPS URL lub ścieżka). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pushRemote?: string;

  /** Token (GitHub PAT) do importu z prywatnego repo. Pusty = wyczyść. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  token?: string;
}

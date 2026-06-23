import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Pola w snake_case zgodnie z kontraktem API ze specyfikacji. */
export class CreateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  file_path: string;

  @IsString()
  @MaxLength(1_000_000)
  content_raw: string;

  /** Opcjonalny opis zmiany do historii. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

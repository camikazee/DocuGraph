import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateShareLinkDto {
  @IsString()
  @MinLength(1)
  path: string;

  /** Opcjonalne wygaśnięcie w dniach (1–365); brak = link bezterminowy. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

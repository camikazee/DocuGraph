import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishDto {
  /** Wiadomość commita (opcjonalna). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}

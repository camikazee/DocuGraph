import { IsString, MaxLength, MinLength } from 'class-validator';

export class MoveDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  from: string;

  @IsString()
  @MinLength(1)
  @MaxLength(400)
  to: string;
}

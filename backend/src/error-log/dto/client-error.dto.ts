import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ClientErrorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;
}

import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9_-]*$/, {
    message: 'username may contain letters, numbers, "_" and "-" only',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  // Avatar jako data URL (PNG/JPG). Limit ~3 MB po base64.
  @IsOptional()
  @IsString()
  @MaxLength(3_000_000)
  @Matches(/^data:image\/(png|jpeg|jpg|webp);base64,/, {
    message: 'avatarUrl must be a PNG/JPEG/WebP data URL',
  })
  avatarUrl?: string;
}

import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VOLUME_PROVIDERS, VolumeProvider } from '../schemas/volume.schema';

export class CreateVolumeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsIn(VOLUME_PROVIDERS as unknown as string[])
  provider: VolumeProvider;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class TestVolumeDto {
  @IsIn(VOLUME_PROVIDERS as unknown as string[])
  provider: VolumeProvider;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class RenameAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}

export class MoveAssetDto {
  /** UUID wolumenu docelowego. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  volumeId: string;
}

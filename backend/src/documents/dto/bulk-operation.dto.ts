import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BulkOperationDto {
  @IsIn(['addTag', 'removeTag', 'move', 'delete'])
  op: 'addTag' | 'removeTag' | 'move' | 'delete';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  paths: string[];

  /** Wymagany dla addTag/removeTag. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  tag?: string;

  /** Folder docelowy dla move ('' = katalog główny). */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  toFolder?: string;
}

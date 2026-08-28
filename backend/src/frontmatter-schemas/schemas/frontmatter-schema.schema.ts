import { randomUUID } from 'crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  FRONTMATTER_FIELD_TYPES,
  FrontmatterFieldType,
} from '../dto/frontmatter-schema.dto';

export type FrontmatterSchemaDocument = HydratedDocument<FrontmatterSchema>;

@Schema({ _id: false })
export class FrontmatterField {
  @Prop({ type: String, required: true, maxlength: 64 })
  key: string;

  @Prop({ type: String, required: true, maxlength: 80 })
  label: string;

  @Prop({ type: String, required: true, enum: FRONTMATTER_FIELD_TYPES })
  type: FrontmatterFieldType;

  @Prop({ type: Boolean, required: true })
  required: boolean;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({ type: String, default: '', maxlength: 500 })
  defaultValue: string;
}

const FrontmatterFieldSchema = SchemaFactory.createForClass(FrontmatterField);

@Schema({ timestamps: true, collection: 'frontmatter_schemas' })
export class FrontmatterSchema {
  @Prop({ type: String, required: true, unique: true, default: randomUUID })
  uuid: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ type: String, default: '', maxlength: 240 })
  description: string;

  @Prop({ type: [FrontmatterFieldSchema], required: true })
  fields: FrontmatterField[];
}

export const FrontmatterSchemaSchema =
  SchemaFactory.createForClass(FrontmatterSchema);
FrontmatterSchemaSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
FrontmatterSchemaSchema.index({ workspaceId: 1, createdAt: 1 });

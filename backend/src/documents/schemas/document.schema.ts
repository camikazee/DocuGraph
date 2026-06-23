import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DocumentEntityDocument = HydratedDocument<DocumentEntity>;

@Schema({ _id: false })
export class DocumentMetadata {
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, default: null })
  status: string | null;

  @Prop({ type: String, default: null })
  version: string | null;
}

const DocumentMetadataSchema = SchemaFactory.createForClass(DocumentMetadata);

@Schema({ _id: false })
export class DocumentLinks {
  /** file_path-y, do których linkuje ten dokument. */
  @Prop({ type: [String], default: [] })
  outgoing: string[];

  /** Backlinki — wyliczane w Module C; na razie puste. */
  @Prop({ type: [String], default: [] })
  incoming: string[];
}

const DocumentLinksSchema = SchemaFactory.createForClass(DocumentLinks);

/**
 * Mirror dokumentu Markdown w MongoDB. Źródłem prawdy jest plik na dysku;
 * tu trzymamy zindeksowaną, gotową do odczytu wersję (HTML, metadata, linki).
 * Nazwa klasy DocumentEntity, bo `Document` koliduje z globalnym typem DOM/Mongoose.
 */
@Schema({ timestamps: true, collection: 'documents' })
export class DocumentEntity {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  })
  workspaceId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  filePath: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  contentRaw: string;

  @Prop({ required: true })
  contentHtml: string;

  @Prop({ type: DocumentMetadataSchema, default: () => ({}) })
  metadata: DocumentMetadata;

  @Prop({ type: DocumentLinksSchema, default: () => ({}) })
  links: DocumentLinks;

  // null dla zapisów tokenem CI/CD (brak człowieka-autora).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentEntity);

// Jeden dokument na (workspace, ścieżka) — klucz upsertu.
DocumentSchema.index({ workspaceId: 1, filePath: 1 }, { unique: true });

// Indeks pełnotekstowy (Moduł B): tytuł waży więcej niż treść.
DocumentSchema.index(
  { title: 'text', contentRaw: 'text' },
  { weights: { title: 5, contentRaw: 1 }, name: 'doc_text' },
);

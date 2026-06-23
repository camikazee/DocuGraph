import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Workspace,
  WorkspaceDocument,
} from '../src/workspaces/schemas/workspace.schema';
import { User, UserDocument } from '../src/users/schemas/user.schema';

/**
 * Publiczny uuid workspace → wewnętrzne _id (string) dla bezpośrednich
 * operacji na bazie w testach (membership, ścieżki na dysku).
 */
export async function internalWorkspaceId(
  app: INestApplication,
  uuid: string,
): Promise<string> {
  const model = app.get<Model<WorkspaceDocument>>(
    getModelToken(Workspace.name),
  );
  const ws = await model.findOne({ uuid }).exec();
  if (!ws) throw new Error(`workspace not found for uuid ${uuid}`);
  return ws._id.toString();
}

/** Publiczny uuid usera → wewnętrzne _id (string) dla operacji na bazie. */
export async function internalUserId(
  app: INestApplication,
  uuid: string,
): Promise<string> {
  const model = app.get<Model<UserDocument>>(getModelToken(User.name));
  const u = await model.findOne({ uuid }).exec();
  if (!u) throw new Error(`user not found for uuid ${uuid}`);
  return u._id.toString();
}

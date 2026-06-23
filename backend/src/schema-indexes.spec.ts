import { Schema } from 'mongoose';
import { UserSchema } from './users/schemas/user.schema';
import { WorkspaceSchema } from './workspaces/schemas/workspace.schema';
import { MembershipSchema } from './workspaces/schemas/membership.schema';
import { InvitationSchema } from './invitations/schemas/invitation.schema';
import { ApiKeySchema } from './api-keys/schemas/api-key.schema';
import { DocumentSchema } from './documents/schemas/document.schema';

/** Czy schema deklaruje indeks o danym kształcie pól (i opcjonalnie unique). */
function hasIndex(
  schema: Schema,
  fields: Record<string, number>,
  opts?: { unique?: boolean },
): boolean {
  const keys = Object.keys(fields);
  return schema.indexes().some(([def, options]) => {
    const defKeys = Object.keys(def);
    const sameShape =
      defKeys.length === keys.length && keys.every((k) => def[k] === fields[k]);
    if (!sameShape) return false;
    if (opts?.unique !== undefined) {
      return Boolean(options?.unique) === opts.unique;
    }
    return true;
  });
}

describe('Schematy — indeksy i ograniczenia', () => {
  it('User.email jest unikalny', () => {
    expect(UserSchema.path('email').options.unique).toBe(true);
  });

  it('Workspace.slug jest unikalny', () => {
    expect(WorkspaceSchema.path('slug').options.unique).toBe(true);
  });

  it('Membership ma złożony unikalny indeks (workspaceId, userId)', () => {
    expect(
      hasIndex(
        MembershipSchema,
        { workspaceId: 1, userId: 1 },
        { unique: true },
      ),
    ).toBe(true);
  });

  it('ApiKey.keyHash ma unikalny indeks', () => {
    expect(hasIndex(ApiKeySchema, { keyHash: 1 }, { unique: true })).toBe(true);
  });

  it('Invitation ma indeks po tokenHash', () => {
    expect(hasIndex(InvitationSchema, { tokenHash: 1 })).toBe(true);
  });

  it('Invitation ma indeks (workspaceId, status)', () => {
    expect(hasIndex(InvitationSchema, { workspaceId: 1, status: 1 })).toBe(
      true,
    );
  });

  it('Document ma złożony unikalny indeks (workspaceId, filePath)', () => {
    expect(
      hasIndex(
        DocumentSchema,
        { workspaceId: 1, filePath: 1 },
        { unique: true },
      ),
    ).toBe(true);
  });
});

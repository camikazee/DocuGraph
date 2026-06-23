import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { AuthProvider } from './schemas/user.schema';

interface CreateUserInput {
  email: string;
  name: string;
  passwordHash?: string | null;
  avatarUrl?: string | null;
  authProviders?: AuthProvider[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create({
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash ?? null,
      avatarUrl: input.avatarUrl ?? null,
      authProviders: input.authProviders ?? [],
    });
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  /** Zwraca usera wraz z `passwordHash` (domyślnie ukrytym) — tylko do logowania. */
  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Aktualizuje pola profilu. Atomowy `$set` tylko dla przekazanych pól —
   * nie dotykamy `passwordHash` (select:false) ani innych pól.
   */
  async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      bio?: string;
      avatarUrl?: string;
    },
  ): Promise<UserDocument | null> {
    const $set: Record<string, string | null> = {};
    if (data.name !== undefined) $set.name = data.name;
    if (data.username !== undefined) $set.username = data.username || null;
    if (data.bio !== undefined) $set.bio = data.bio || null;
    if (data.avatarUrl !== undefined) $set.avatarUrl = data.avatarUrl || null;
    if (Object.keys($set).length > 0) {
      await this.userModel.updateOne({ _id: userId }, { $set });
    }
    return this.findById(userId);
  }

  /** Zapisuje hash tokenu resetu hasła i jego wygaśnięcie (atomowo). */
  async setResetToken(
    userId: string,
    tokenHash: string,
    expires: Date,
  ): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpires: expires,
        },
      },
    );
  }

  /** Znajduje usera po hashu tokenu resetu (z polami resetu). */
  findByResetTokenHash(tokenHash: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ passwordResetTokenHash: tokenHash })
      .select('+passwordResetTokenHash +passwordResetExpires')
      .exec();
  }

  /**
   * Ustawia nowe hasło i kasuje token resetu (jednorazowość) — atomowo.
   */
  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: { passwordHash },
        $unset: { passwordResetTokenHash: '', passwordResetExpires: '' },
      },
    );
  }

  /**
   * Dopina providera OAuth do usera, jeśli jeszcze go nie ma.
   * Używamy atomowego `$push` zamiast `document.save()` — dokument bywa wczytany
   * bez `passwordHash` (select:false), więc save() mógłby je nadpisać.
   */
  async addAuthProvider(
    user: UserDocument,
    provider: AuthProvider,
  ): Promise<UserDocument> {
    const exists = user.authProviders.some(
      (p) =>
        p.provider === provider.provider &&
        p.providerUserId === provider.providerUserId,
    );
    if (!exists) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $push: { authProviders: provider } },
      );
    }
    return user;
  }
}

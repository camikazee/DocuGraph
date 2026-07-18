import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotificationPreference,
  NotificationPreferenceDocument,
} from './schemas/notification-preference.schema';

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectModel(NotificationPreference.name)
    private readonly prefModel: Model<NotificationPreferenceDocument>,
  ) {}

  /** Preferencje użytkownika (z domyślnymi, gdy brak zapisu). */
  async get(userId: string): Promise<{ emailEnabled: boolean }> {
    const pref = await this.prefModel.findOne({ userId }).lean().exec();
    return { emailEnabled: pref?.emailEnabled ?? false };
  }

  /** Ustawia preferencje (upsert). */
  async set(
    userId: string,
    emailEnabled: boolean,
  ): Promise<{ emailEnabled: boolean }> {
    await this.prefModel.updateOne(
      { userId },
      { $set: { emailEnabled } },
      { upsert: true },
    );
    return { emailEnabled };
  }

  /** Podzbiór userIds, którzy mają włączony e-mail (do rozsyłki). */
  async emailEnabledAmong(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const prefs = await this.prefModel
      .find({ userId: { $in: userIds }, emailEnabled: true })
      .select('userId')
      .lean()
      .exec();
    return new Set(prefs.map((p) => p.userId.toString()));
  }
}

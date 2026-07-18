import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NotificationPreference,
  NotificationPreferenceDocument,
} from './schemas/notification-preference.schema';

export interface Preferences {
  emailEnabled: boolean;
  digestEnabled: boolean;
}

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectModel(NotificationPreference.name)
    private readonly prefModel: Model<NotificationPreferenceDocument>,
  ) {}

  /** Preferencje użytkownika (z domyślnymi, gdy brak zapisu). */
  async get(userId: string): Promise<Preferences> {
    const pref = await this.prefModel.findOne({ userId }).lean().exec();
    return {
      emailEnabled: pref?.emailEnabled ?? false,
      digestEnabled: pref?.digestEnabled ?? false,
    };
  }

  /** Aktualizuje wskazane pola preferencji (upsert, merge). */
  async set(userId: string, patch: Partial<Preferences>): Promise<Preferences> {
    const $set: Partial<Preferences> = {};
    if (patch.emailEnabled !== undefined)
      $set.emailEnabled = patch.emailEnabled;
    if (patch.digestEnabled !== undefined)
      $set.digestEnabled = patch.digestEnabled;
    await this.prefModel.updateOne({ userId }, { $set }, { upsert: true });
    return this.get(userId);
  }

  /** Podzbiór userIds z włączonym e-mailem natychmiastowym. */
  async emailEnabledAmong(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const prefs = await this.prefModel
      .find({ userId: { $in: userIds }, emailEnabled: true })
      .select('userId')
      .lean()
      .exec();
    return new Set(prefs.map((p) => p.userId.toString()));
  }

  /** Wszyscy userId z włączonym dziennym digestem. */
  async digestRecipients(): Promise<string[]> {
    const prefs = await this.prefModel
      .find({ digestEnabled: true })
      .select('userId')
      .lean()
      .exec();
    return prefs.map((p) => p.userId.toString());
  }
}

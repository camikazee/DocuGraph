import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Group, GroupDocument } from './schemas/group.schema';
import {
  AccessLevel,
  AccessRule,
  AccessRuleDocument,
  SubjectType,
} from './schemas/access-rule.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2 };

/** Funkcja zwracająca efektywny poziom dostępu usera do danej ścieżki. */
export type AccessChecker = (filePath: string) => AccessLevel;

@Injectable()
export class AccessService {
  constructor(
    @InjectModel(Group.name) private readonly groupModel: Model<GroupDocument>,
    @InjectModel(AccessRule.name)
    private readonly ruleModel: Model<AccessRuleDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly workspaces: WorkspacesService,
  ) {}

  // ---- Grupy ----

  async listGroups(workspaceId: string) {
    const groups = await this.groupModel
      .find({ workspaceId })
      .sort({ name: 1 })
      .lean()
      .exec();
    const ids = [...new Set(groups.flatMap((g) => g.memberIds.map(String)))];
    const users = ids.length
      ? await this.userModel
          .find({ _id: { $in: ids } })
          .select('uuid name')
          .lean()
          .exec()
      : [];
    const byId = new Map(
      users.map((u) => [u._id.toString(), { userId: u.uuid, name: u.name }]),
    );
    return groups.map((g) => ({
      id: g.uuid,
      name: g.name,
      members: g.memberIds
        .map((m) => byId.get(m.toString()))
        .filter((x): x is { userId: string; name: string } => !!x),
    }));
  }

  async createGroup(workspaceId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Group name is required');
    const exists = await this.groupModel
      .findOne({ workspaceId, name: trimmed })
      .lean()
      .exec();
    if (exists) throw new BadRequestException('A group with that name exists');
    await this.groupModel.create({ workspaceId, name: trimmed, memberIds: [] });
    return this.listGroups(workspaceId);
  }

  async renameGroup(workspaceId: string, uuid: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Group name is required');
    const res = await this.groupModel.updateOne(
      { workspaceId, uuid },
      { $set: { name: trimmed } },
    );
    if (res.matchedCount === 0) throw new NotFoundException('Group not found');
    return this.listGroups(workspaceId);
  }

  async deleteGroup(workspaceId: string, uuid: string) {
    const group = await this.groupModel.findOne({ workspaceId, uuid }).exec();
    if (!group) throw new NotFoundException('Group not found');
    // Kasujemy też reguły odnoszące się do tej grupy (spójność).
    await this.ruleModel.deleteMany({
      workspaceId,
      subjectType: 'group',
      subjectId: group._id,
    });
    await this.groupModel.deleteOne({ _id: group._id });
    return this.listGroups(workspaceId);
  }

  /** Ustawia członków grupy (po publicznych uuid userów, tylko członkowie ws). */
  async setGroupMembers(
    workspaceId: string,
    uuid: string,
    memberUuids: string[],
  ) {
    const group = await this.groupModel.findOne({ workspaceId, uuid }).exec();
    if (!group) throw new NotFoundException('Group not found');
    const internal: Types.ObjectId[] = [];
    for (const u of [...new Set(memberUuids)]) {
      const id = await this.workspaces.resolveUserId(u);
      if (id && (await this.workspaces.findMembership(workspaceId, id))) {
        internal.push(new Types.ObjectId(id));
      }
    }
    group.memberIds = internal;
    await group.save();
    return this.listGroups(workspaceId);
  }

  // ---- Reguły ----

  async listRules(workspaceId: string) {
    const rules = await this.ruleModel
      .find({ workspaceId })
      .sort({ path: 1 })
      .lean()
      .exec();
    const groupIds = rules
      .filter((r) => r.subjectType === 'group' && r.subjectId)
      .map((r) => r.subjectId!.toString());
    const userIds = rules
      .filter((r) => r.subjectType === 'user' && r.subjectId)
      .map((r) => r.subjectId!.toString());
    const groups = groupIds.length
      ? await this.groupModel
          .find({ _id: { $in: groupIds } })
          .select('uuid name')
          .lean()
          .exec()
      : [];
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds } })
          .select('uuid name')
          .lean()
          .exec()
      : [];
    const gById = new Map(groups.map((g) => [g._id.toString(), g]));
    const uById = new Map(users.map((u) => [u._id.toString(), u]));
    return rules.map((r) => {
      let subjectId: string | null = null;
      let subjectName = 'Everyone';
      if (r.subjectType === 'group' && r.subjectId) {
        const g = gById.get(r.subjectId.toString());
        subjectId = g?.uuid ?? null;
        subjectName = g?.name ?? '(deleted group)';
      } else if (r.subjectType === 'user' && r.subjectId) {
        const u = uById.get(r.subjectId.toString());
        subjectId = u?.uuid ?? null;
        subjectName = u?.name ?? '(unknown user)';
      }
      return {
        id: r.uuid,
        path: r.path,
        subjectType: r.subjectType,
        subjectId,
        subjectName,
        level: r.level,
      };
    });
  }

  async upsertRule(
    workspaceId: string,
    input: {
      path: string;
      subjectType: SubjectType;
      subjectId?: string | null;
      level: AccessLevel;
    },
  ) {
    const path = input.path.trim();
    if (!path) throw new BadRequestException('Path is required');
    let subjectId: Types.ObjectId | null = null;
    if (input.subjectType === 'group') {
      const g = await this.groupModel
        .findOne({ workspaceId, uuid: input.subjectId ?? '' })
        .exec();
      if (!g) throw new BadRequestException('Group not found');
      subjectId = g._id;
    } else if (input.subjectType === 'user') {
      const id = await this.workspaces.resolveUserId(input.subjectId ?? '');
      if (!id || !(await this.workspaces.findMembership(workspaceId, id))) {
        throw new BadRequestException('User is not a workspace member');
      }
      subjectId = new Types.ObjectId(id);
    }
    await this.ruleModel.updateOne(
      { workspaceId, path, subjectType: input.subjectType, subjectId },
      { $set: { level: input.level } },
      { upsert: true },
    );
    return this.listRules(workspaceId);
  }

  async deleteRule(workspaceId: string, uuid: string) {
    const res = await this.ruleModel.deleteOne({ workspaceId, uuid });
    if (res.deletedCount === 0) throw new NotFoundException('Rule not found');
    return this.listRules(workspaceId);
  }

  // ---- Egzekwowanie ----

  /**
   * Buduje checker dostępu dla usera: ładuje reguły + grupy raz, zwraca funkcję
   * `(path) -> none|read|write`. CI i Owner mają pełny dostęp (bypass).
   */
  async buildChecker(
    workspaceId: string,
    userId: string | null,
    role: string | undefined,
  ): Promise<AccessChecker> {
    // CI token (brak usera) i Owner: pełny dostęp.
    if (!userId || role === 'owner') return () => 'write';

    const base: AccessLevel = role === 'viewer' ? 'read' : 'write';
    const rules = await this.ruleModel.find({ workspaceId }).lean().exec();
    if (rules.length === 0) return () => base;

    const myGroups = new Set(
      (
        await this.groupModel
          .find({ workspaceId, memberIds: new Types.ObjectId(userId) })
          .select('_id')
          .lean()
          .exec()
      ).map((g) => g._id.toString()),
    );

    const matches = (r: (typeof rules)[number]) =>
      r.subjectType === 'all' ||
      (r.subjectType === 'user' && r.subjectId?.toString() === userId) ||
      (r.subjectType === 'group' &&
        !!r.subjectId &&
        myGroups.has(r.subjectId.toString()));

    const applies = (rulePath: string, filePath: string) =>
      rulePath.endsWith('/')
        ? filePath === rulePath.slice(0, -1) || filePath.startsWith(rulePath)
        : filePath === rulePath;

    return (filePath: string): AccessLevel => {
      let best: { len: number; level: AccessLevel } | null = null;
      for (const r of rules) {
        if (!matches(r) || !applies(r.path, filePath)) continue;
        const len = r.path.length;
        if (
          !best ||
          len > best.len ||
          (len === best.len && RANK[r.level] > RANK[best.level])
        ) {
          best = { len, level: r.level };
        }
      }
      return best ? best.level : base;
    };
  }
}

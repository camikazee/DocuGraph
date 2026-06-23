import { IsEnum } from 'class-validator';
import { Role, ROLE_VALUES } from '../../common/enums/role.enum';

export class UpdateMemberRoleDto {
  @IsEnum(Role, {
    message: `role must be one of: ${ROLE_VALUES.join(', ')}`,
  })
  role: Role;
}

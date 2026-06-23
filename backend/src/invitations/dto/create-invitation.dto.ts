import { IsEmail, IsEnum } from 'class-validator';
import { Role, ROLE_VALUES } from '../../common/enums/role.enum';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsEnum(Role, {
    message: `role must be one of: ${ROLE_VALUES.join(', ')}`,
  })
  role: Role;
}

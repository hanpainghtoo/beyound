import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';

@Injectable()
export class PlatformAdminGuard
  extends AuthGuard('jwt')
  implements CanActivate
{
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = super.canActivate(context);
    const authenticated = isObservable(result)
      ? await firstValueFrom(result)
      : await result;
    if (!authenticated) return false;

    const request = context.switchToHttp().getRequest();
    if (request.user?.type !== 'platform_admin') {
      throw new ForbiddenException('Platform administrator access is required');
    }

    return true;
  }
}

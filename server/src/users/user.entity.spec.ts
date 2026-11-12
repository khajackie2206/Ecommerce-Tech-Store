import { instanceToPlain } from 'class-transformer';
import { User } from './user.entity.js';

describe('User entity', () => {
  it('drops passwordHash when turned into JSON', () => {
    const user = Object.assign(new User(), {
      email: 'an@mail.com',
      passwordHash: '$argon2id$v=19$...',
      fullName: 'An Nguyen',
    });

    // instanceToPlain is exactly what ClassSerializerInterceptor runs on responses
    const json = instanceToPlain(user);

    expect(json.email).toBe('an@mail.com');
    expect(json).not.toHaveProperty('passwordHash');
  });

  it('also hides passwordHash when the user is nested in another object', () => {
    const user = Object.assign(new User(), { passwordHash: 'secret' });
    const json = instanceToPlain({ accessToken: 'abc', user });
    expect(json.user).not.toHaveProperty('passwordHash');
  });
});

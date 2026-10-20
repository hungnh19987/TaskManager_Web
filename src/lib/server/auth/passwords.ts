import argon2 from 'argon2';
import type { PasswordCodec } from './service';

export const passwords: PasswordCodec = {
  hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
  verify: (hash, password) => argon2.verify(hash, password)
};

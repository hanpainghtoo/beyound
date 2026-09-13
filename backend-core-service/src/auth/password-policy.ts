export const MINIMUM_PASSWORD_LENGTH = 12;
export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 12 characters and include uppercase, lowercase, number, and special character.';
export const COMMON_PASSWORD_MESSAGE =
  'Password is too common. Choose a less predictable password.';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'letmein',
  'letmein123',
  'welcome',
  'welcome123',
  'changeme',
  'defaultpassword',
]);

function normalizePasswordForCommonCheck(password: string) {
  return password.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isCommonPassword(password: string) {
  return COMMON_PASSWORDS.has(normalizePasswordForCommonCheck(password));
}

export function isStrongPassword(password: string) {
  return (
    password.length >= MINIMUM_PASSWORD_LENGTH &&
    PASSWORD_POLICY_REGEX.test(password) &&
    !isCommonPassword(password)
  );
}

export function assertStrongPassword(password: string) {
  if (
    password.length < MINIMUM_PASSWORD_LENGTH ||
    !PASSWORD_POLICY_REGEX.test(password)
  ) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  if (isCommonPassword(password)) {
    throw new Error(COMMON_PASSWORD_MESSAGE);
  }
}

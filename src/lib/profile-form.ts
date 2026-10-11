import type { FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import { ageOn, MINIMUM_AGE } from './format';

/**
 * The profile form that registration (`app/(onboarding)/profile.tsx`) and Edit profile
 * (`app/account/profile.tsx`) both fill in. One schema, so the two never disagree, and the same
 * copy as the website's (`sukun-client-web/src/components/account/profileForm.ts`).
 *
 * These fields gate purchase (CLAUDE.md rule 8). The living area is an Egyptian governorate,
 * so it is only asked of, and only required of, an Egyptian number.
 */

/*
 * Each message says what to do about that one field (owner's call 2026-10-10: say plainly what
 * is missing or incomplete).
 */
export const FULL_NAME_REQUIRED_MESSAGE = 'Enter your full name';
export const EMAIL_REQUIRED_MESSAGE = 'Enter your email';
export const EMAIL_INVALID_MESSAGE = 'Check your email, it should look like name@example.com';
export const DATE_OF_BIRTH_REQUIRED_MESSAGE = 'Pick your date of birth';
export const UNDER_AGE_MESSAGE = `You must be ${MINIMUM_AGE} or over`;
export const GENDER_REQUIRED_MESSAGE = 'Pick your gender';
export const AREA_REQUIRED_MESSAGE = 'Pick your living area';

export function buildProfileSchema(areaRequired: boolean) {
  return z.object({
    fullName: z.string().trim().min(2, FULL_NAME_REQUIRED_MESSAGE),
    // An empty email is the first check's to answer: a field shows one message at a time.
    email: z.string().trim().min(1, EMAIL_REQUIRED_MESSAGE).email(EMAIL_INVALID_MESSAGE),
    dateOfBirth: z
      .string()
      .trim()
      .min(1, DATE_OF_BIRTH_REQUIRED_MESSAGE)
      .refine(
        (value) => value.length === 0 || ageOn(value, new Date()) >= MINIMUM_AGE,
        UNDER_AGE_MESSAGE,
      ),
    gender: z.enum(['male', 'female'], { error: GENDER_REQUIRED_MESSAGE }),
    areaId: areaRequired ? z.string().min(1, AREA_REQUIRED_MESSAGE) : z.string().optional(),
    // Consent, so it is never required and never pre-ticked: Meta only accepts marketing
    // messages sent on an explicit opt-in, and a default-on box is not one.
    marketingOptIn: z.boolean(),
  });
}

export type ProfileFormValues = z.infer<ReturnType<typeof buildProfileSchema>>;

/** A field the form refused, by its name in the form and as it reads mid-sentence. */
export interface ProfileProblem {
  name: keyof ProfileFormValues;
  label: string;
}

/** The fields that can be refused, in the order the form shows them. */
const PROFILE_FIELD_LABELS: ProfileProblem[] = [
  { name: 'fullName', label: 'full name' },
  { name: 'email', label: 'email' },
  { name: 'dateOfBirth', label: 'date of birth' },
  { name: 'gender', label: 'gender' },
  { name: 'areaId', label: 'living area' },
];

/** The fields the form refused, top to bottom, for `FormProblems`. */
export function profileProblems(errors: FieldErrors<ProfileFormValues>): ProfileProblem[] {
  return PROFILE_FIELD_LABELS.filter(({ name }) => errors[name]);
}

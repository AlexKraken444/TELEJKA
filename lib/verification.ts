// Administrative permission is bound to the existing owner's immutable account ID.
// A verification badge never grants administrative access.
export const VERIFICATION_OWNER_ID = "5158ea3a-fcb5-44cb-8f29-362b94aa1744";
export function canManageVerification(userId: string) {
  return userId === VERIFICATION_OWNER_ID;
}

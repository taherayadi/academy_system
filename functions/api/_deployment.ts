/** Fixed at source level: never selected by a request or environment flag. */
export const APPLICATION = 'center' as const;
export function isDeploymentRole(role: unknown): boolean {
  return ['admin', 'super_admin', 'restricted_admin'].includes(String(role));
}

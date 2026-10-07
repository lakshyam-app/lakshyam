/* Central place for "is this person allowed to use X?".
   Personal app today: everything is allowed.
   Later, roles (super admin, sub-admin) and subscriptions plug in here
   without touching any screen. */

export function can(/* feature, context */) {
  return true;
}

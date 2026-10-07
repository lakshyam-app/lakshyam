/* Central place for "is this person allowed to use X?".
   Personal app today: everything that is switched on in flags.js is allowed.
   Later, roles (super admin, sub-admin) and subscriptions plug in here
   without touching any screen. */
import { flags } from "./flags.js";

export function can(feature /* , context */) {
  return flags[feature] !== false;
}

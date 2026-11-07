const roleCapabilities = {
  owner: ["read", "write", "approve", "delete", "manage", "export"],
  admin: ["read", "write", "approve", "delete", "manage", "export"],
  manager: ["read", "write", "approve", "delete", "export"],
  member: ["read", "write"],
  viewer: ["read"],
};

// Unknown roles and actions always deny. Platform support is granted by a
// verified, time-limited server session rather than a membership role.
export function canRole(role, action) {
  return (
    Object.hasOwn(roleCapabilities, role) &&
    roleCapabilities[role].includes(action)
  );
}

export function assignableRoles(actorRole) {
  if (actorRole === "owner") return ["admin", "manager", "member", "viewer"];
  if (actorRole === "admin") return ["manager", "member", "viewer"];
  return [];
}

export function canManageMember(actorRole, targetRole) {
  return (
    targetRole !== "owner" && assignableRoles(actorRole).includes(targetRole)
  );
}

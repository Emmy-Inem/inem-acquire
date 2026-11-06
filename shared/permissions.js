export function canRole(role, action) {
  if (action === "read")
    return ["owner", "admin", "manager", "member", "viewer"].includes(role);
  if (action === "manage") return ["owner", "admin"].includes(role);
  if (action === "approve" || action === "delete")
    return ["owner", "admin", "manager"].includes(role);
  return ["owner", "admin", "manager", "member"].includes(role);
}

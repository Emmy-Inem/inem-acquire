export async function api(
  path,
  { method = "GET", body, organizationId, signal } = {},
) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The server returned an invalid response" }));
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: response.status,
    });
  return data;
}

import { z } from "zod";

const statuses = ["routine", "attention", "monitoring"];
const uuid = z.string().uuid();
const directoryFields = "id,name,industry,website,created_at,operation_status,member_count";
const pageSize = 20;

export function platformOrganizationRoutes(app, { admin, result, wrap }) {
  app.get("/api/platform/summary", wrap(async (_req, res) => {
    const db = admin();
    const [organizations, attention, monitoring] = await Promise.all([
      db.from("organizations").select("id", { count: "exact", head: true }),
      ...["attention", "monitoring"].map((status) =>
        db.from("platform_organization_operations")
          .select("organization_id", { count: "exact", head: true }).eq("status", status),
      ),
    ]);
    for (const item of [organizations, attention, monitoring]) result(item);
    res.json({ organizations: organizations.count, attention: attention.count, monitoring: monitoring.count });
  }));

  app.get("/api/platform/organizations", wrap(async (req, res) => {
    const { search, status, page } = z.object({
      search: z.string().trim().max(120).default(""),
      status: z.enum(["all", ...statuses]).default("all"),
      page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    }).strict().parse(req.query);
    const offset = (page - 1) * pageSize;
    let query = admin().from("platform_organization_directory")
      .select(directoryFields, { count: "exact" })
      .order("created_at", { ascending: false }).order("id")
      .range(offset, offset + pageSize - 1);
    if (search) query = query.ilike("name", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
    if (status !== "all") query = query.eq("operation_status", status);
    const response = await query;
    res.json({ organizations: result(response), count: response.count, pageSize });
  }));

  app.get("/api/platform/organizations/:id", wrap(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const db = admin();
    const org = result(await db.from("platform_organization_directory")
      .select(directoryFields).eq("id", id).maybeSingle());
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const [operations, billing, events, support] = await Promise.all([
      db.from("platform_organization_operations").select("status,internal_note,updated_at").eq("organization_id", id).maybeSingle(),
      db.from("billing_accounts").select("plan,status,period_end").eq("organization_id", id).maybeSingle(),
      db.from("platform_organization_events").select("id,status,note_changed,created_at")
        .eq("organization_id", id).order("id", { ascending: false }).limit(8),
      db.from("support_sessions").select("id,reason,created_at,expires_at,ended_at")
        .eq("organization_id", id).eq("user_id", req.user.id).order("created_at", { ascending: false }).limit(8),
    ]);
    res.json({ organization: org, operations: result(operations), billing: result(billing), events: result(events), support: result(support) });
  }));

  app.patch("/api/platform/organizations/:id/operations", wrap(async (req, res) => {
    const id = uuid.parse(req.params.id);
    const data = z.object({
      status: z.enum(statuses),
      note: z.string().trim().max(2000),
      updatedAt: z.iso.datetime({ offset: true }).nullable(),
    }).strict().parse(req.body);
    const response = await req.db.rpc("set_platform_organization_operations", {
      target_org: id,
      next_status: data.status,
      next_note: data.note,
      expected_updated_at: data.updatedAt,
    });
    if (response.status === 409 || response.error?.code === "PT409")
      return res.status(409).json({ error: "Someone updated this organization. Reload its details before saving." });
    if (response.error?.code === "P0002")
      return res.status(404).json({ error: "Organization not found" });
    result(response);
    res.json({ saved: true });
  }));
}

import fs from "node:fs/promises";
import { z } from "zod";
const email = z
  .string()
  .email()
  .parse(process.env.PLATFORM_OWNER_EMAIL || "")
  .toLowerCase()
  .replaceAll("'", "''");
await fs.mkdir("work", { recursive: true });
await fs.writeFile(
  "work/register-owner.sql",
  `begin; insert into private.platform_owner_allowlist(email) values ('${email}') on conflict do nothing; insert into public.platform_roles(user_id,role) select id,'platform_owner' from auth.users where lower(email)='${email}' and email_confirmed_at is not null on conflict do nothing;commit;`,
);
console.log(
  "Prepared work/register-owner.sql. Apply it with a trusted Supabase deployment account; no client can execute owner registration.",
);

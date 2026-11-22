import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const providerSchemas = {
  gemini: z.object({
    apiKey: z.string().trim().min(10).max(500),
    model: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9.-]{1,79}$/)
      .default("gemini-3.1-flash-lite"),
  }),
  resend: z.object({
    apiKey: z.string().trim().min(8).max(500),
    outboundFrom: z.string().trim().min(3).max(254),
    inboundDomain: z.string().trim().max(253).optional().default(""),
  }),
  apollo: z.object({
    apiKey: z.string().trim().min(8).max(500),
  }),
  stripe: z.object({
    apiKey: z.string().trim().min(8).max(500),
    priceStarter: z.string().trim().max(120).optional().default(""),
    priceGrowth: z.string().trim().max(120).optional().default(""),
  }),
};

function deriveKey(env, orgId) {
  const master =
    env.INTEGRATION_ENCRYPTION_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_ANON_KEY ||
    "inem-acquire-local-key";
  return createHash("sha256")
    .update(`${master}:integration:${orgId}`)
    .digest();
}

export function encryptIntegrationPayload(env, orgId, payload) {
  const key = deriveKey(env, orgId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptIntegrationPayload(env, orgId, row) {
  try {
    const key = deriveKey(env, orgId);
    const iv = Buffer.from(row.iv, "base64");
    const authTag = Buffer.from(row.auth_tag || row.authTag, "base64");
    const encrypted = Buffer.from(row.ciphertext, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

export function maskSecret(secret) {
  const clean = String(secret || "").trim();
  if (clean.length <= 8) return "••••••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

export function parseProviderConfig(provider, body) {
  const schema = providerSchemas[provider];
  if (!schema) {
    throw Object.assign(new Error("Unsupported integration provider"), {
      status: 400,
    });
  }
  return schema.parse(body);
}

/**
 * Live verification of an integration key against the provider's official API
 * before persisting or when the user clicks "Test connection".
 */
export async function verifyProviderConnection(provider, config) {
  if (provider === "gemini") {
    const model = config.model || "gemini-3.1-flash-lite";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
      {
        headers: { "x-goog-api-key": config.apiKey },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      throw Object.assign(
        new Error(
          "Gemini API key could not be verified. Check your key from Google AI Studio and try again.",
        ),
        { status: 400 },
      );
    }
    return {
      verified: true,
      detail: `Connected to Google Gemini (${model})`,
    };
  }

  if (provider === "resend") {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok && response.status !== 403) {
      // Note: Sending-only Resend keys may return 401 if invalid, or 403 on /domains if restricted to sending
      throw Object.assign(
        new Error(
          "Resend API key was rejected. Ensure you entered a valid Resend API key (re_...).",
        ),
        { status: 400 },
      );
    }
    return {
      verified: true,
      detail: `Resend key verified · Sender: ${config.outboundFrom}`,
    };
  }

  if (provider === "apollo") {
    const response = await fetch(
      "https://api.apollo.io/api/v1/mixed_companies/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          q_organization_keyword_tags: ["software"],
          page: 1,
          per_page: 1,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {
      throw Object.assign(
        new Error(
          "Apollo API key could not be verified. Check your Apollo API key and plan permissions.",
        ),
        { status: 400 },
      );
    }
    return {
      verified: true,
      detail: "Connected to Apollo company search API",
    };
  }

  if (provider === "stripe") {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw Object.assign(
        new Error(
          "Stripe secret key could not be verified. Enter a valid Stripe secret or restricted key (sk_...).",
        ),
        { status: 400 },
      );
    }
    return {
      verified: true,
      detail: "Connected to Stripe billing API",
    };
  }

  throw Object.assign(new Error("Unsupported provider"), { status: 400 });
}

/**
 * Loads organization-scoped decrypted secrets and merges them over the server's default env
 * so every workspace can run with its own self-served API keys immediately.
 */
export async function resolveOrganizationEnv(env, adminClient, orgId) {
  if (!orgId || !env.SUPABASE_SERVICE_ROLE_KEY) return env;
  try {
    const { data, error } = await adminClient.rpc(
      "get_organization_integration_secrets",
      { target_org: orgId },
    );
    if (error || !Array.isArray(data) || !data.length) return env;
    const merged = { ...env };
    for (const row of data) {
      const secret = decryptIntegrationPayload(env, orgId, row);
      if (!secret) continue;
      if (row.provider === "gemini" && secret.apiKey) {
        merged.GEMINI_API_KEY = secret.apiKey;
        if (secret.model) {
          merged.GEMINI_MODEL = secret.model;
          merged.GEMINI_SEARCH_MODEL = secret.model;
        }
      } else if (row.provider === "resend" && secret.apiKey) {
        merged.RESEND_API_KEY = secret.apiKey;
        if (secret.outboundFrom) merged.OUTBOUND_FROM = secret.outboundFrom;
        if (secret.inboundDomain) merged.INBOUND_DOMAIN = secret.inboundDomain;
      } else if (row.provider === "apollo" && secret.apiKey) {
        merged.APOLLO_API_KEY = secret.apiKey;
      } else if (row.provider === "stripe" && secret.apiKey) {
        merged.STRIPE_SECRET_KEY = secret.apiKey;
        if (secret.priceStarter) merged.STRIPE_PRICE_STARTER = secret.priceStarter;
        if (secret.priceGrowth) merged.STRIPE_PRICE_GROWTH = secret.priceGrowth;
      }
    }
    return merged;
  } catch {
    return env;
  }
}

export async function listOrganizationIntegrations(env, adminClient, orgId) {
  let rows = [];
  if (orgId && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { data } = await adminClient.rpc(
        "get_organization_integration_secrets",
        { target_org: orgId },
      );
      if (Array.isArray(data)) rows = data;
    } catch {
      rows = [];
    }
  }
  const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));

  const buildStatus = (provider, name, envConfigured) => {
    const custom = byProvider[provider];
    const configured = !!custom || envConfigured;
    return {
      name,
      provider,
      configured,
      ...(custom
        ? {
            source: "workspace",
            keyHint: custom.key_hint || "••••",
            metadata: custom.metadata || {},
            updatedAt: custom.updated_at || null,
          }
        : envConfigured
          ? { source: "platform" }
          : {}),
    };
  };

  return [
    buildStatus("gemini", "Gemini assistance", !!env.GEMINI_API_KEY),
    buildStatus(
      "resend",
      "Email delivery",
      !!(env.RESEND_API_KEY && env.OUTBOUND_FROM),
    ),
    buildStatus("apollo", "Prospect enrichment", !!env.APOLLO_API_KEY),
    buildStatus(
      "stripe",
      "Subscription billing",
      !!(
        env.STRIPE_SECRET_KEY &&
        env.STRIPE_PRICE_STARTER &&
        env.STRIPE_PRICE_GROWTH
      ),
    ),
  ];
}

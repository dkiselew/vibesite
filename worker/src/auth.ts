import { mcp } from "@better-auth/mcp";
import { requireMcpAuth } from "@better-auth/mcp";
import { getCurrentAdapter } from "@better-auth/core/context";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { jwt } from "better-auth/plugins/jwt";
import { organization } from "better-auth/plugins/organization";
import type { JWTPayload } from "jose";
import { mcpResource } from "./config";
import { slugFromEmail } from "./slug";

export type Actor = {
  organizationId: string;
  slug: string;
};

type OrganizationRow = { id: string; slug: string };
type MemberRow = { organizationId: string };

function defineAuthConfig<const T extends BetterAuthOptions>(config: T): T {
  return config;
}

export async function createAuth(options: {
  database: BetterAuthOptions["database"];
  secret: string;
  baseURL: string;
  migrate?: boolean;
}) {
  const baseURL = options.baseURL.replace(/\/$/, "");
  const secure = baseURL.startsWith("https:");
  const resource = mcpResource(baseURL);

  const config = defineAuthConfig({
    database: options.database,
    secret: options.secret,
    baseURL,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
    },
    trustedOrigins: [baseURL],
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: {
        sameSite: "lax" as const,
        secure,
        httpOnly: true,
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session: { userId: string }) => {
            const organizationId = await ensureFolder(auth, session.userId);
            if (!organizationId) return;
            return { data: { ...session, activeOrganizationId: organizationId } };
          },
        },
      },
    },
    plugins: [
      jwt({
        jwks: { disablePrivateKeyEncryption: true },
      }),
      organization(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        postLogin: {
          page: "/sign-in",
          shouldRedirect: async () => false,
          consentReferenceId: ({ session }): string => {
            const organizationId = (session as { activeOrganizationId?: string | null }).activeOrganizationId;
            if (!organizationId) {
              throw new APIError("BAD_REQUEST", {
                message: "Choose a folder before connecting.",
              });
            }
            return organizationId;
          },
        },
        customAccessTokenClaims: ({ referenceId }): Record<string, string> => {
          if (!referenceId) return {};
          return { organizationId: referenceId };
        },
      }),
    ],
  });

  if (options.migrate !== false) {
    const { runMigrations } = await getMigrations(config);
    await runMigrations();
  }
  const auth = betterAuth(config);
  await auth.$context;
  return auth;
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;

export async function findOrganizationBySlug(auth: Auth, slug: string): Promise<OrganizationRow | null> {
  const ctx = await auth.$context;
  const row = await ctx.adapter.findOne<OrganizationRow>({
    model: "organization",
    where: [{ field: "slug", value: slug }],
  });
  return row ?? null;
}

export async function findOrganizationById(auth: Auth, id: string): Promise<OrganizationRow | null> {
  const ctx = await auth.$context;
  const row = await ctx.adapter.findOne<OrganizationRow>({
    model: "organization",
    where: [{ field: "id", value: id }],
  });
  return row ?? null;
}

type Rows = {
  findOne: <T>(args: {
    model: string;
    where: { field: string; value: string }[];
  }) => Promise<T | null>;
  findMany: <T>(args: {
    model: string;
    where: { field: string; value: string }[];
    limit?: number;
  }) => Promise<T[]>;
  create: (args: { model: string; data: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
};

async function currentRows(auth: Auth): Promise<Rows> {
  const ctx = await auth.$context;
  return getCurrentAdapter(ctx.adapter) as Promise<Rows>;
}

async function firstOrganizationId(db: Rows, userId: string): Promise<string | null> {
  const members = await db.findMany<MemberRow>({
    model: "member",
    where: [{ field: "userId", value: userId }],
    limit: 1,
  });
  return members[0]?.organizationId ?? null;
}

async function ensureFolder(auth: Auth, userId: string): Promise<string | null> {
  const db = await currentRows(auth);
  const existing = await firstOrganizationId(db, userId);
  if (existing) return existing;
  const user = await db.findOne<{ id: string; name: string; email: string }>({
    model: "user",
    where: [{ field: "id", value: userId }],
  });
  if (!user?.email) return null;
  return createFolder(db, user);
}

async function createFolder(
  db: Rows,
  user: { id: string; name: string; email: string },
): Promise<string> {
  const base = slugFromEmail(user.email);
  let slug = base;
  for (let attempt = 2; attempt < 100; attempt++) {
    const existing = await db.findOne<OrganizationRow>({
      model: "organization",
      where: [{ field: "slug", value: slug }],
    });
    if (!existing) break;
    slug = `${base}-${attempt}`;
  }
  const organization = (await db.create({
    model: "organization",
    data: {
      name: user.name || slug,
      slug,
      createdAt: new Date(),
    },
  })) as OrganizationRow;
  await db.create({
    model: "member",
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "owner",
      createdAt: new Date(),
    },
  });
  return organization.id;
}

export async function actorFromRequest(auth: Auth, request: Request): Promise<Actor | Response> {
  const authorization = request.headers.get("authorization");
  if (authorization?.match(/^Bearer\s+\S+/i)) {
    return actorFromBearer(auth, request);
  }
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    return unauthorized();
  }
  const organization = await findOrganizationById(auth, organizationId);
  if (!organization) return unauthorized();
  return { organizationId: organization.id, slug: organization.slug };
}

async function actorFromBearer(auth: Auth, request: Request): Promise<Actor | Response> {
  const resource = mcpResource(auth.options.baseURL ?? "");
  let claims: JWTPayload | undefined;
  const verified = await requireMcpAuth(
    auth,
    async (_request, tokenClaims) => {
      claims = tokenClaims;
      return new Response(null, { status: 204 });
    },
    { resource },
  )(request);
  if (!claims) return verified;

  const organizationId = claims.organizationId;
  if (typeof organizationId !== "string" || !organizationId) return unauthorized(verified);
  const organization = await findOrganizationById(auth, organizationId);
  if (!organization) return unauthorized(verified);
  return { organizationId: organization.id, slug: organization.slug };
}

function unauthorized(source?: Response): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  const challenge = source?.headers.get("WWW-Authenticate");
  if (challenge) headers.set("WWW-Authenticate", challenge);
  return new Response(
    JSON.stringify({ error: { code: "unauthorized", message: "Sign in required." } }),
    { status: 401, headers },
  );
}

export function isActor(value: Actor | Response): value is Actor {
  return !(value instanceof Response);
}

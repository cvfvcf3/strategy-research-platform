import { z } from "zod";
import { checkAdminSecret } from "@/lib/utils/auth";
import { db } from "@/lib/db/client";
import { appConfig } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  riskPerTradePct: z.number().min(0).max(0.1).optional(),
  kellyCapPct: z.number().min(0).max(0.2).optional(),
  maxLeverage: z.number().min(1).max(10).optional(),
  feeBps: z.number().min(0).max(100).optional(),
  slippageBps: z.number().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const auth = checkAdminSecret(request);
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid config", details: parsed.error.flatten() }, { status: 400 });

  await db
    .insert(appConfig)
    .values({ key: "runtime_config", value: parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: parsed.data, updatedAt: new Date() } });

  return Response.json({ ok: true, config: parsed.data });
}

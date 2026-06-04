import { z } from 'zod';

export const SignalQuerySchema = z.object({ tenantId: z.string().min(1), category: z.string().optional(), minEdge: z.coerce.number().optional() });
export const DossierQuerySchema = z.object({ marketId: z.string().min(1) });
export const PerformanceQuerySchema = z.object({ tenantId: z.string().min(1), from: z.string().datetime().optional(), to: z.string().datetime().optional() });
export const ResearchPackRequestSchema = z.object({ tenantId: z.string().min(1), marketIds: z.array(z.string().min(1)).min(1), title: z.string().min(1) });
export const SafetyQuerySchema = z.object({ tenantId: z.string().min(1) });
export const ReconciliationQuerySchema = z.object({ tenantId: z.string().min(1) });
export const ReconciliationUpdateSchema = z.object({
  tenantId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  action: z.enum(['acknowledge', 'clear']),
  reason: z.string().min(1)
});
export const SafetyUpdateSchema = z.object({
  tenantId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  killSwitch: z.object({
    active: z.boolean(),
    reason: z.string().min(1)
  }).optional(),
  liveAuthorization: z.object({
    enabled: z.boolean(),
    reason: z.string().min(1)
  }).optional()
}).refine((value) => value.killSwitch || value.liveAuthorization, { message: 'killSwitch or liveAuthorization update is required' });

export type SignalQuery = z.infer<typeof SignalQuerySchema>;
export type SafetyUpdate = z.infer<typeof SafetyUpdateSchema>;
export type ReconciliationUpdate = z.infer<typeof ReconciliationUpdateSchema>;

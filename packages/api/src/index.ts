import { z } from 'zod';

export const SignalQuerySchema = z.object({ tenantId: z.string().min(1), category: z.string().optional(), minEdge: z.coerce.number().optional() });
export const DossierQuerySchema = z.object({ marketId: z.string().min(1) });
export const PerformanceQuerySchema = z.object({ tenantId: z.string().min(1), from: z.string().datetime().optional(), to: z.string().datetime().optional() });
export const ResearchPackRequestSchema = z.object({ tenantId: z.string().min(1), marketIds: z.array(z.string().min(1)).min(1), title: z.string().min(1) });

export type SignalQuery = z.infer<typeof SignalQuerySchema>;

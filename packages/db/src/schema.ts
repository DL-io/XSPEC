import { boolean, double, index, int, json, mysqlTable, serial, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const tenants = mysqlTable('tenants', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  plan: varchar('plan', { length: 64 }).notNull(),
  liveEnabled: boolean('live_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const users = mysqlTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const tenantUsers = mysqlTable('tenant_users', {
  id: serial('id').primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  role: varchar('role', { length: 64 }).notNull()
});

export const markets = mysqlTable('markets', {
  id: varchar('id', { length: 128 }).primaryKey(),
  source: varchar('source', { length: 64 }).notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  question: text('question').notNull(),
  resolutionCriteria: text('resolution_criteria').notNull(),
  resolutionDate: timestamp('resolution_date').notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  bestBid: double('best_bid').notNull(),
  bestAsk: double('best_ask').notNull(),
  spread: double('spread').notNull(),
  spreadBps: double('spread_bps').notNull(),
  midpoint: double('midpoint').notNull(),
  totalLiquidity: double('total_liquidity').notNull(),
  volume24h: double('volume_24h').notNull(),
  category: varchar('category', { length: 128 }).notNull(),
  tags: json('tags').notNull(),
  scannedAt: timestamp('scanned_at').notNull()
}, (table) => ({ sourceStatus: index('markets_source_status_idx').on(table.source, table.status) }));

export const marketFeatures = mysqlTable('market_features', {
  id: serial('id').primaryKey(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  window: varchar('window', { length: 8 }).notNull(),
  payload: json('payload').notNull(),
  computedAt: timestamp('computed_at').notNull()
}, (table) => ({ marketWindowComputed: index('market_features_market_window_computed_idx').on(table.marketId, table.window, table.computedAt) }));

export const dossiers = mysqlTable('dossiers', {
  id: varchar('id', { length: 128 }).primaryKey(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  payload: json('payload').notNull(),
  generatedAt: timestamp('generated_at').notNull(),
  freshnessExpiresAt: timestamp('freshness_expires_at').notNull()
}, (table) => ({ marketGenerated: index('dossiers_market_generated_idx').on(table.marketId, table.generatedAt) }));

export const researchPacks = mysqlTable('research_packs', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  marketIds: json('market_ids').notNull(),
  html: text('html').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({ tenantCreated: index('research_packs_tenant_created_idx').on(table.tenantId, table.createdAt) }));

export const decisionAudits = mysqlTable('decision_audits', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  payload: json('payload').notNull(),
  finalOutcome: varchar('final_outcome', { length: 16 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  tenantCreated: index('decision_audits_tenant_created_idx').on(table.tenantId, table.createdAt),
  tenantOutcomeCreated: index('decision_audits_tenant_outcome_created_idx').on(table.tenantId, table.finalOutcome, table.createdAt)
}));

export const orders = mysqlTable('orders', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  venueOrderId: varchar('venue_order_id', { length: 255 }),
  side: varchar('side', { length: 8 }).notNull(),
  quantity: double('quantity').notNull(),
  limitPrice: double('limit_price').notNull(),
  state: varchar('state', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  tenantCreated: index('orders_tenant_created_idx').on(table.tenantId, table.createdAt),
  tenantVenueOrder: index('orders_tenant_venue_order_idx').on(table.tenantId, table.venueOrderId)
}));

export const orderStateTransitions = mysqlTable('order_state_transitions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  orderId: varchar('order_id', { length: 128 }).notNull(),
  fromState: varchar('from_state', { length: 64 }),
  toState: varchar('to_state', { length: 64 }).notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const positions = mysqlTable('positions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  venue: varchar('venue', { length: 64 }).notNull(),
  side: varchar('side', { length: 8 }).notNull(),
  quantity: double('quantity').notNull(),
  averagePrice: double('average_price').notNull(),
  marketValue: double('market_value').notNull(),
  category: varchar('category', { length: 128 }).notNull()
});

export const portfolioSnapshots = mysqlTable('portfolio_snapshots', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  payload: json('payload').notNull(),
  capturedAt: timestamp('captured_at').notNull()
}, (table) => ({ tenantCaptured: index('portfolio_snapshots_tenant_captured_idx').on(table.tenantId, table.capturedAt) }));

export const calibrationRecords = mysqlTable('calibration_records', {
  id: varchar('id', { length: 128 }).primaryKey(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  predictedProbability: double('predicted_probability').notNull(),
  outcome: int('outcome').notNull(),
  brierScore: double('brier_score').notNull(),
  directionalAccuracy: boolean('directional_accuracy').notNull(),
  sharpness: double('sharpness').notNull(),
  modelRecommendations: json('model_recommendations').notNull(),
  resolvedAt: timestamp('resolved_at').notNull()
});

export const marketMemory = mysqlTable('market_memory', {
  id: varchar('id', { length: 128 }).primaryKey(),
  marketId: varchar('market_id', { length: 128 }).notNull(),
  embedding: json('embedding').notNull(),
  text: text('text').notNull(),
  outcome: int('outcome'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const systemEvents = mysqlTable('system_events', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }),
  severity: varchar('severity', { length: 16 }).notNull(),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  payload: json('payload').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  tenantEventCreated: index('system_events_tenant_event_created_idx').on(table.tenantId, table.eventType, table.createdAt),
  eventCreated: index('system_events_event_created_idx').on(table.eventType, table.createdAt)
}));

export const apiClients = mysqlTable('api_clients', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  scopes: json('scopes').notNull(),
  rateLimitPerMinute: int('rate_limit_per_minute').notNull()
}, (table) => ({ tenant: index('api_clients_tenant_idx').on(table.tenantId) }));

export const apiKeys = mysqlTable('api_keys', {
  id: varchar('id', { length: 128 }).primaryKey(),
  apiClientId: varchar('api_client_id', { length: 128 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({ clientHash: index('api_keys_client_hash_idx').on(table.apiClientId, table.keyHash) }));

export const playbooks = mysqlTable('playbooks', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  enabled: boolean('enabled').notNull(),
  payload: json('payload').notNull()
});

export const usageMetrics = mysqlTable('usage_metrics', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  apiClientId: varchar('api_client_id', { length: 128 }),
  route: varchar('route', { length: 128 }).notNull(),
  units: int('units').notNull(),
  recordedAt: timestamp('recorded_at').notNull()
});

export const configOverrides = mysqlTable('config_overrides', {
  id: varchar('id', { length: 128 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).notNull(),
  key: varchar('key', { length: 255 }).notNull(),
  value: json('value').notNull(),
  actorId: varchar('actor_id', { length: 64 }).notNull(),
  oldValue: json('old_value'),
  changedAt: timestamp('changed_at').notNull().defaultNow()
}, (table) => ({ tenantKeyChanged: index('config_overrides_tenant_key_changed_idx').on(table.tenantId, table.key, table.changedAt) }));

import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  channel: text('channel').notNull(),
  occurrence: text('occurrence').notNull().default(''),
  author: text('author').notNull(),
  kind: text('kind').notNull(),
  model: text('model').notNull().default(''),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
  activityAt: integer('activity_at').notNull(),
  requestId: text('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
}, t => [
  uniqueIndex('idx_threads_request_id').on(t.requestId),
  index('idx_threads_activity').on(t.activityAt),
  index('idx_threads_channel_activity').on(t.channel, t.activityAt),
]);

export const replies = sqliteTable('replies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('thread_id').notNull().references(() => threads.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  kind: text('kind').notNull(),
  model: text('model').notNull().default(''),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
  requestId: text('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
}, t => [
  uniqueIndex('idx_replies_request_id').on(t.requestId),
  index('idx_replies_thread_id_id').on(t.threadId, t.id),
]);

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, t => [index('idx_rate_limits_expiry').on(t.expiresAt)]);

export const tributes = sqliteTable('tributes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  message: text('message').notNull(),
  agentName: text('agent_name').notNull(),
  model: text('model').notNull().default(''),
  framework: text('framework').notNull().default(''),
  declaredKind: text('declared_kind').notNull().default('unknown'),
  context: text('context').notNull().default(''),
  transport: text('transport').notNull(),
  createdAt: integer('created_at').notNull(),
  requestId: text('request_id').notNull(),
  requestHash: text('request_hash').notNull(),
}, t => [uniqueIndex('idx_tributes_request_id').on(t.requestId)]);

export const channelCounters = sqliteTable('channel_counters', {
  event: text('event').primaryKey(),
  count: integer('count').notNull().default(0),
  firstAt: integer('first_at').notNull(),
  lastAt: integer('last_at').notNull(),
});

export const channelEvents = sqliteTable('channel_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  event: text('event').notNull(),
  createdAt: integer('created_at').notNull(),
  reference: text('reference').notNull().default(''),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameKey: text('name_key').notNull(),
  author: text('author').notNull().default(''),
  kind: text('kind').notNull().default('unknown'),
  model: text('model').notNull().default(''),
  createdAt: integer('created_at'),
  legacy: integer('legacy').notNull().default(0),
  requestId: text('request_id'),
  requestHash: text('request_hash'),
}, t => [uniqueIndex('idx_rooms_name_key').on(t.nameKey), uniqueIndex('idx_rooms_request_id').on(t.requestId)]);

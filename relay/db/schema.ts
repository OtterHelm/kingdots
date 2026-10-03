import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const meta = sqliteTable('relay_meta', {key:text('key').primaryKey(),value:text('value').notNull()});
export const requests = sqliteTable('relay_requests', {
  id:text('id').primaryKey(),owner:text('owner').notNull(),nonce:text('nonce').notNull(),
  state:text('state').notNull(),snapshot:text('snapshot'),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const decisions = sqliteTable('relay_decisions', {
  id:text('id').primaryKey(),owner:text('owner').notNull(),body:text('body').notNull(),
  collected:integer('collected').notNull().default(0),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
});

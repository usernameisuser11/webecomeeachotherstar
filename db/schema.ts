import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const stars = sqliteTable("stars", {
  id: text("id").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  name: text("name").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  hue: integer("hue").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ ownerUnique: uniqueIndex("stars_owner_unique").on(t.ownerHash) }));

export const glows = sqliteTable("glows", {
  id: text("id").primaryKey(),
  fromHash: text("from_hash").notNull(),
  toStarId: text("to_star_id").notNull().references(() => stars.id),
  day: text("day").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ onceADay: uniqueIndex("glows_once_per_day").on(t.fromHash,t.toStarId,t.day) }));

export const presence = sqliteTable("presence", {
  ownerHash: text("owner_hash").primaryKey(),
  lastSeen: integer("last_seen").notNull(),
});

// Named skies are independent of the original shared sky. No existing records move.
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  ownerHash: text("owner_hash").notNull(),
  name: text("name").notNull(),
  visibility: text("visibility").notNull(),
  theme: text("theme").notNull().default("forest"),
  inviteHash: text("invite_hash"),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ ownerIdx: index("rooms_owner_hash_idx").on(t.ownerHash) }));

export const roomStars = sqliteTable("room_stars", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id),
  ownerHash: text("owner_hash").notNull(),
  name: text("name").notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  hue: integer("hue").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ oncePerRoom: uniqueIndex("room_stars_owner_room_unique").on(t.ownerHash, t.roomId), roomIdx: index("room_stars_room_id_idx").on(t.roomId) }));

export const roomGlows = sqliteTable("room_glows", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id),
  fromHash: text("from_hash").notNull(),
  toStarId: text("to_star_id").notNull().references(() => roomStars.id),
  day: text("day").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ onceADay: uniqueIndex("room_glows_once_per_day").on(t.fromHash, t.toStarId, t.day), roomIdx: index("room_glows_room_id_idx").on(t.roomId) }));

export const roomPresence = sqliteTable("room_presence", {
  roomId: text("room_id").notNull().references(() => rooms.id),
  ownerHash: text("owner_hash").notNull(),
  lastSeen: integer("last_seen").notNull(),
}, (t) => ({ oncePerPerson: uniqueIndex("room_presence_person_room_unique").on(t.roomId, t.ownerHash) }));

// Reports are private moderation records, never included in the public sky API.
// Target IDs are globally unique UUIDs, including room IDs.
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  roomId: text("room_id"),
  reporterHash: text("reporter_hash").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  oncePerTarget: uniqueIndex("reports_target_reporter_unique").on(t.targetType, t.targetId, t.reporterHash),
  roomIdx: index("reports_room_id_idx").on(t.roomId),
  reporterIdx: index("reports_reporter_created_idx").on(t.reporterHash, t.createdAt),
}));

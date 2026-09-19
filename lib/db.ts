import {resourceFailure} from './resource-error';
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabaseUrl } from "./database-url";
const globalDb = globalThis as unknown as {
  telejkaSql?: ReturnType<typeof postgres>;
  telejkaSchema?: Promise<void>;
  telejkaPause?: {until:number;error:unknown};
};
export function noteDatabaseFailure(error:unknown){if(resourceFailure(error).quota)globalDb.telejkaPause={until:Date.now()+300000,error};}
export function db() {
  if(globalDb.telejkaPause&&globalDb.telejkaPause.until>Date.now())throw globalDb.telejkaPause.error;
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  return (globalDb.telejkaSql ??= postgres(url, {
    max: process.env.TELEJKA_DB_POOL_SIZE === "1" ? 1 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}
export function databaseUrl() {
  return getDatabaseUrl();
}

export function ensureDatabase() {
  if (!globalDb.telejkaSchema) {
    globalDb.telejkaSchema = (async () => {
      const schema = await readFile(
        join(process.cwd(), "db", "schema.sql"),
        "utf8",
      );
      await db().begin(async (tx) => {
        // Serialize first-run setup across concurrent Vercel functions.
        await tx`SELECT pg_advisory_xact_lock(847291063)`;
        await tx.unsafe(schema);
        await tx`CREATE TABLE IF NOT EXISTS telejka_migrations (name text PRIMARY KEY)`;
        const [done] =
          await tx`SELECT 1 FROM telejka_migrations WHERE name='encrypted-media-v1'`;
        if (!done) {
          await tx.unsafe(
            await readFile(join(process.cwd(), "db", "features.sql"), "utf8"),
          );
          await tx`INSERT INTO telejka_migrations(name) VALUES ('encrypted-media-v1')`;
        }
        await tx`CREATE TABLE IF NOT EXISTS profile_music(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE)`;
        const [callsDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='voice-calls-v1'`;
        if(!callsDone){await tx.unsafe(await readFile(join(process.cwd(),'db','calls.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES ('voice-calls-v1')`;}
        const [pushDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='web-push-v1'`;
        if(!pushDone){await tx.unsafe(await readFile(join(process.cwd(),'db','push.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES ('web-push-v1')`;}
        const [communityDone] =
          await tx`SELECT 1 FROM telejka_migrations WHERE name='community-v1'`;
        const [badgesDone] =
          await tx`SELECT 1 FROM telejka_migrations WHERE name='verification-v1'`;
        if (!badgesDone) {
          await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false`;
          await tx`UPDATE users SET verified=true WHERE id='5158ea3a-fcb5-44cb-8f29-362b94aa1744'`;
          await tx`INSERT INTO telejka_migrations(name) VALUES ('verification-v1')`;
        }
        if (!communityDone) {
          await tx.unsafe(
            await readFile(join(process.cwd(), "db", "community.sql"), "utf8"),
          );
          await tx`INSERT INTO telejka_migrations(name) VALUES ('community-v1')`;
        }
        const [studioDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='social-studio-v1'`;
        if(!studioDone){await tx.unsafe(await readFile(join(process.cwd(),'db','social-studio.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES ('social-studio-v1')`;}
        const [inlineDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='polls-inline-v1'`;
        if(!inlineDone){await tx.unsafe(await readFile(join(process.cwd(),'db','polls-inline.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES ('polls-inline-v1')`;}
        const [editDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='edit-share-v1'`;if(!editDone){await tx.unsafe(await readFile(join(process.cwd(),'db','edit-share.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES('edit-share-v1')`;}
        const [economyDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='economy-v1'`;if(!economyDone){await tx.unsafe(await readFile(join(process.cwd(),'db','economy.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES('economy-v1')`;}
        const [presenceDone]=await tx`SELECT 1 FROM telejka_migrations WHERE name='presence-v1'`;if(!presenceDone){await tx.unsafe(await readFile(join(process.cwd(),'db','presence.sql'),'utf8'));await tx`INSERT INTO telejka_migrations(name) VALUES('presence-v1')`;}
      });
    })().catch((error) => {
      noteDatabaseFailure(error);
      globalDb.telejkaSchema = undefined;
      throw error;
    });
  }
  return globalDb.telejkaSchema;
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { FeatureError } from "./api-error";
const json = (v: unknown) =>
  NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
const id = z.uuid();
export async function musicApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
): Promise<Response | undefined> {
  if (path[0] !== "music") return;
  if (!["GET", "POST", "DELETE"].includes(req.method))
    throw new FeatureError(405, "Метод не поддерживается.");
  const sql = db();
  if (path[1] === "releases" && req.method === "POST") {
    const data = z
      .object({
        title: z.string().trim().min(1).max(150),
        cover: id,
        tracks: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(150),
              uploadId: id,
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(input);
    const ids = [data.cover, ...data.tracks.map((t) => t.uploadId)];
    if (new Set(ids).size !== ids.length)
      throw new FeatureError(400, "Файлы должны быть разными.");
    return json(
      await sql.begin(async (tx) => {
        const files =
          await tx`SELECT * FROM uploads WHERE id IN ${tx(ids)} AND owner_id=${userId} AND chat_id IS NULL AND ready=true AND published=false FOR UPDATE`;
        if (
          files.length !== ids.length ||
          !files.find((f) => f.id === data.cover)?.mime.startsWith("image/") ||
          data.tracks.some(
            (t) =>
              !files
                .find((f) => f.id === t.uploadId)
                ?.mime.startsWith("audio/"),
          )
        )
          throw new FeatureError(400, "Нужны обложка и аудиофайлы.");
        const [release] =
          await tx`INSERT INTO music_releases(owner_id,title,cover_id) VALUES(${userId},${data.title},${data.cover}) RETURNING id`;
        for (let i = 0; i < data.tracks.length; i++)
          await tx`INSERT INTO music_tracks(release_id,upload_id,title,position) VALUES(${release.id},${data.tracks[i].uploadId},${data.tracks[i].title},${i})`;
        await tx`UPDATE uploads SET published=true WHERE id IN ${tx(ids)}`;
        return release;
      }),
    );
  }
  if (path[1] === "tracks" && req.method === "GET") {
    const author = req.nextUrl.searchParams.get("author");
    if (author) id.parse(author);
    const track = path[2] ? id.parse(path[2]) : null;
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 150);
    const liked = req.nextUrl.searchParams.get("liked") === "true";
    return json(
      await sql`SELECT t.*,r.title release_title,r.owner_id,telejka_user(r.owner_id,${userId}::uuid) author,jsonb_build_object('id',a.id,'name',a.name,'mime',a.mime,'size',a.size) file,jsonb_build_object('id',c.id,'name',c.name,'mime',c.mime,'size',c.size) cover,EXISTS(SELECT 1 FROM music_likes l WHERE l.track_id=t.id AND l.user_id=${userId}) liked FROM music_tracks t JOIN music_releases r ON r.id=t.release_id JOIN uploads a ON a.id=t.upload_id JOIN uploads c ON c.id=r.cover_id WHERE telejka_can_view(r.owner_id,${userId}::uuid) AND (${track}::uuid IS NULL OR t.id=${track}) AND (${author}::uuid IS NULL OR r.owner_id=${author}) AND (${!q} OR t.title ILIKE ${"%" + q + "%"} OR r.title ILIKE ${"%" + q + "%"}) AND (${!liked} OR EXISTS(SELECT 1 FROM music_likes l WHERE l.track_id=t.id AND l.user_id=${userId})) ORDER BY r.created_at DESC,t.position LIMIT 200`,
    );
  }
  if (path[1] === "tracks" && path[3] === "like") {
    const tid = id.parse(path[2]);
    const [visible] =
      await sql`SELECT 1 FROM music_tracks t JOIN music_releases r ON r.id=t.release_id WHERE t.id=${tid} AND telejka_can_view(r.owner_id,${userId}::uuid)`;
    if (!visible) throw new FeatureError(404, "Песня недоступна.");
    if (req.method === "POST")
      await sql`INSERT INTO music_likes VALUES(${userId},${tid}) ON CONFLICT DO NOTHING`;
    else if (req.method === "DELETE")
      await sql`DELETE FROM music_likes WHERE user_id=${userId} AND track_id=${tid}`;
    return json({ ok: true });
  }
  if (path[1] === "playlists") {
    if (path.length === 2) {
      if (req.method === "POST") {
        const title = z.string().trim().min(1).max(100).parse(input.title);
        const [row] =
          await sql`INSERT INTO music_playlists(owner_id,title) VALUES(${userId},${title}) RETURNING *`;
        return json(row);
      }
      if (req.method === "GET")
        return json(
          await sql`SELECT * FROM music_playlists WHERE owner_id=${userId} ORDER BY created_at DESC`,
        );
    }
    const pid = id.parse(path[2]);
    const [list] =
      await sql`SELECT * FROM music_playlists WHERE id=${pid} AND owner_id=${userId}`;
    if (!list) throw new FeatureError(404, "Плейлист не найден.");
    if (req.method === "GET")
      return json(
        await sql`SELECT track_id FROM music_playlist_tracks WHERE playlist_id=${pid} ORDER BY added_at`,
      );
    if (path[3]) {
      const tid = id.parse(path[3]);
      if (req.method === "POST") {
        const [visible] =
          await sql`SELECT 1 FROM music_tracks t JOIN music_releases r ON r.id=t.release_id WHERE t.id=${tid} AND telejka_can_view(r.owner_id,${userId}::uuid)`;
        if (!visible) throw new FeatureError(404, "Песня недоступна.");
        await sql`INSERT INTO music_playlist_tracks VALUES(${pid},${tid},now()) ON CONFLICT DO NOTHING`;
      } else if (req.method === "DELETE")
        await sql`DELETE FROM music_playlist_tracks WHERE playlist_id=${pid} AND track_id=${tid}`;
      return json({ ok: true });
    }
  }
}

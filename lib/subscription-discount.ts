import { randomInt } from "node:crypto";
import { db } from "./db";
import { FeatureError } from "./api-error";
export async function discountStatus(userId: string) {
  const [row] =
    await db()`SELECT d.percent,d.used_at,EXISTS(SELECT 1 FROM baton_ledger WHERE user_id=${userId} AND ref ~ '^(plus|mini):') purchased FROM users u LEFT JOIN subscription_discounts d ON d.user_id=u.id WHERE u.id=${userId}`;
  const available = !row.purchased && !row.used_at;
  return { available, percent: available ? Number(row.percent || 0) : 0 };
}
export async function spinDiscount(userId: string) {
  return db().begin(async (tx) => {
    // Same wallet lock as purchase: a spin cannot race a purchase or another spin.
    await tx`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
    await tx`SELECT user_id FROM wallets WHERE user_id=${userId} FOR UPDATE`;
    if (
      (
        await tx`SELECT 1 FROM baton_ledger WHERE user_id=${userId} AND ref ~ '^(plus|mini):' LIMIT 1`
      ).length
    )
      throw new FeatureError(
        409,
        "Колесо доступно только до первой покупки подписки.",
      );
    const [old] =
      await tx`SELECT percent,used_at FROM subscription_discounts WHERE user_id=${userId}`;
    if (old) {
      if (old.used_at) throw new FeatureError(409, "Скидка уже использована.");
      return { available: true, percent: old.percent };
    }
    const percent = (randomInt(5) + 1) * 10;
    await tx`INSERT INTO subscription_discounts(user_id,percent) VALUES(${userId},${percent})`;
    return { available: true, percent };
  });
}

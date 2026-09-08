import { z } from "zod";
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Имя: минимум 2 символа")
  .max(32, "Имя: максимум 32 символа")
  .regex(
    /^[\p{L}\p{N}_ .-]+$/u,
    "В имени допустимы буквы, цифры, пробелы, точки, дефис и _",
  );
export const passwordSchema = z
  .string()
  .min(8, "Пароль: минимум 8 символов")
  .max(72, "Пароль слишком длинный")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Пароль: максимум 72 байта",
  );
export const avatarSchema = z
  .string()
  .max(400000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
  .nullable()
  .optional();
export const profileSchema = z.object({
  name: nameSchema,
  bio: z.string().trim().max(240).default(""),
  avatar: avatarSchema,
});
export const registerSchema = profileSchema.extend({
  password: passwordSchema,
});
export const idSchema = z.uuid();
export const bodySchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Напишите сообщение")
    .max(max, `Максимум ${max} символов`);
export const nameKey = (name: string) =>
  name.normalize("NFKC").trim().toLocaleLowerCase("ru");

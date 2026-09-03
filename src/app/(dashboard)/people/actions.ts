"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac/guard";
import {
  createDutyRotation,
  scheduleCoverage,
  updateMyPresence,
  type PresenceStatus,
} from "@/lib/people/remote-team";
const PRESENCE = new Set<PresenceStatus>([
  "AVAILABLE",
  "FOCUSED",
  "AWAY",
  "OFFLINE",
]);
export async function updatePresenceAction(formData: FormData) {
  const user = await requireUser();
  const status = value(formData, "presenceStatus") as PresenceStatus;
  if (!PRESENCE.has(status)) throw new Error("Presence status is invalid");
  await updateMyPresence({
    userId: user.id,
    timezone: required(formData, "timezone"),
    languages: required(formData, "languages").split(","),
    available: formData.get("available") === "on",
    presenceStatus: status,
    presenceNote: value(formData, "presenceNote"),
    workingDays: formData.getAll("workingDays").map(Number),
    localStart: required(formData, "localStart"),
    localEnd: required(formData, "localEnd"),
  });
  revalidatePath("/people");
  revalidatePath("/today");
}
export async function scheduleCoverageAction(formData: FormData) {
  const user = await requireUser();
  const timezone = required(formData, "coverageTimezone");
  await scheduleCoverage({
    actorUserId: user.id,
    userId: required(formData, "userId"),
    queueKey: required(formData, "queueKey"),
    startsAt: wallTime(formData, "startsAt", timezone),
    endsAt: wallTime(formData, "endsAt", timezone),
    responsibility: value(formData, "responsibility"),
  });
  revalidatePath("/people");
}
export async function createRotationAction(formData: FormData) {
  const user = await requireUser();
  const timezone = required(formData, "timezone");
  await createDutyRotation({
    actorUserId: user.id,
    name: required(formData, "name"),
    queueKey: required(formData, "queueKey"),
    primaryUserId: required(formData, "primaryUserId"),
    backupUserId: value(formData, "backupUserId") || null,
    timezone,
    cadenceDays: Number(required(formData, "cadenceDays")),
    nextHandoffAt: wallTime(formData, "nextHandoffAt", timezone),
  });
  revalidatePath("/people");
}
function value(f: FormData, k: string) {
  const x = f.get(k);
  return typeof x === "string" ? x.trim() : "";
}
function required(f: FormData, k: string) {
  const x = value(f, k);
  if (!x) throw new Error(`${k} is required`);
  return x;
}
function wallTime(f: FormData, k: string, timeZone: string) {
  const value = required(f, k);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`${k} is invalid`);
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new Error("Timezone is invalid");
  }
  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const [year, month, day, hour, minute] = [yearValue, monthValue, dayValue, hourValue, minuteValue].map(Number) as [number, number, number, number, number];
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = wallParts(new Date(instant), timeZone);
    instant +=
      target -
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
      );
  }
  const result = new Date(instant);
  const roundTrip = wallParts(result, timeZone);
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute
  )
    throw new Error(`${k} falls in an invalid timezone transition`);
  return result;
}
function wallParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

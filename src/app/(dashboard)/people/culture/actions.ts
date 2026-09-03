"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/rbac/guard";
import { addMilestone,addRitual,recognise,updateProfile } from "@/lib/people/organisation";
export async function updateProfileAction(f:FormData){const u=await requireUser();await updateProfile({userId:u.id,departmentId:value(f,"departmentId")||null,introduction:value(f,"introduction"),responsibilities:csv(f,"responsibilities"),skills:csv(f,"skills"),helpWith:value(f,"helpWith")});refresh();}
export async function recogniseAction(f:FormData){const u=await requireUser();await recognise({actorUserId:u.id,recipientUserId:required(f,"recipientUserId"),contribution:required(f,"contribution")});refresh();}
export async function milestoneAction(f:FormData){const u=await requireUser();await addMilestone({actorUserId:u.id,title:required(f,"title"),meaning:required(f,"meaning"),happenedOn:required(f,"happenedOn")});refresh();}
export async function ritualAction(f:FormData){const u=await requireUser();await addRitual({actorUserId:u.id,name:required(f,"name"),purpose:required(f,"purpose"),cadence:required(f,"cadence")});refresh();}
function refresh(){revalidatePath("/people/culture");}function value(f:FormData,k:string){const v=f.get(k);return typeof v==="string"?v.trim():"";}function required(f:FormData,k:string){const v=value(f,k);if(!v)throw new Error(`${k} is required`);return v;}function csv(f:FormData,k:string){return value(f,k).split(",").map(x=>x.trim()).filter(Boolean);}

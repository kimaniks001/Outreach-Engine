import Link from "next/link";
import { requireUser } from "@/lib/rbac/guard";
import {
  ensureCompanyConversation,
  getConversation,
  listActionDrafts,
  listConversationsForUser,
  listMessages,
  listStaffDirectory,
  searchMessages,
  type ConversationSummary,
  type StaffMessage,
} from "@/lib/conversations/staff-conversations";
import {
  createActionDraftAction,
  createCircleAction,
  createDirectAction,
  markReadAction,
  sendMessageAction,
  togglePinAction,
  toggleReactionAction,
} from "./actions";

const REACTIONS = ["👍", "❤️", "🎉", "👀", "✅"] as const;
const ACTION_DRAFTS = [
  ["TASK", "Task"],
  ["FOLLOW_UP", "Follow-up"],
  ["CASE", "Case"],
  ["INCIDENT", "Incident"],
  ["APPROVAL", "Approval"],
  ["KNOWLEDGE", "Knowledge"],
] as const;

type PageParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConversationsPage({ searchParams }: { searchParams: PageParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const query = scalar(params.q);
  const requestedId = scalar(params.c);
  const replyId = scalar(params.reply);
  const error = scalar(params.error);
  const drafted = scalar(params.drafted) === "1";

  await ensureCompanyConversation();

  const [directory, conversations, results] = await Promise.all([
    listStaffDirectory(user.id),
    listConversationsForUser(user.id),
    query ? searchMessages(user.id, query) : Promise.resolve([]),
  ]);

  const selectedId = requestedId || conversations[0]?.id || null;
  let selected = null;
  let messages: StaffMessage[] = [];
  let drafts = [] as Awaited<ReturnType<typeof listActionDrafts>>;

  if (selectedId) {
    try {
      [selected, messages, drafts] = await Promise.all([
        getConversation(user.id, selectedId),
        listMessages(user.id, selectedId),
        listActionDrafts(user.id, selectedId),
      ]);
    } catch {
      selected = null;
    }
  }

  const replyMessage = replyId ? messages.find((message) => message.id === replyId) ?? null : null;

  return (
    <div className="mx-auto max-w-[1480px] outreach-rise">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-bright shadow-[0_0_0_5px_rgba(63,162,104,0.12)]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Conversations</p>
          </div>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">Talk here. Keep the work with the conversation.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
            Private staff conversations live in Outreach. Market-facing Community LIVE remains a separate SecurePay-authorised space.
          </p>
        </div>
        <Link href="/community-live" className="w-fit rounded-full border border-brand/25 bg-brand-soft/35 px-4 py-2 text-sm font-semibold text-brand-muted transition hover:bg-brand-soft/60">
          Open Community LIVE →
        </Link>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {drafted ? <Notice tone="good">Action saved as a draft. It has not created task, case, incident or approval authority.</Notice> : null}

      <div className="grid min-h-[690px] overflow-hidden rounded-[28px] border border-surface-border bg-surface-raised shadow-quiet xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="border-b border-surface-border bg-surface/70 xl:border-b-0 xl:border-r">
          <div className="border-b border-surface-border p-4">
            <form className="relative" action="/conversations">
              <input name="q" defaultValue={query} placeholder="Search your conversations" className="w-full rounded-2xl border border-surface-border bg-surface-raised px-4 py-2.5 pr-12 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-brand/45" />
              <button className="absolute right-2 top-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-brand">Find</button>
            </form>
          </div>

          {query ? (
            <div className="border-b border-surface-border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Search results</p>
                <Link href="/conversations" className="text-xs text-brand">Clear</Link>
              </div>
              <div className="mt-3 space-y-2">
                {results.length === 0 ? <p className="text-xs leading-5 text-ink-muted">Nothing in conversations you belong to matched “{query}”.</p> : results.map((result) => (
                  <Link key={result.id} href={`/conversations?c=${result.conversationId}`} className="block rounded-xl border border-surface-border bg-surface-raised p-3 transition hover:border-brand/30">
                    <p className="text-xs font-semibold text-ink">{result.conversationTitle}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">{result.authorName}: {result.body}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div className="p-3">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Your rooms</p>
            <div className="space-y-1">
              {conversations.map((conversation) => <ConversationLink key={conversation.id} conversation={conversation} selected={conversation.id === selected?.id} />)}
            </div>
          </div>
        </aside>

        <main className="min-w-0 bg-surface-raised">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-5 py-4 sm:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-2xl text-ink">{selected.title}</h2>
                    <RoomBadge type={selected.type} />
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">{selected.participants.length} {selected.participants.length === 1 ? "person" : "people"} · internal staff space</p>
                </div>
                <form action={markReadAction}>
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <button className="rounded-full border border-surface-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-brand/30 hover:text-brand">Mark read</button>
                </form>
              </div>

              <div className="max-h-[560px] min-h-[430px] space-y-5 overflow-y-auto px-5 py-6 sm:px-6">
                {messages.length === 0 ? (
                  <div className="mx-auto max-w-md py-20 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft/55 text-brand">✦</div>
                    <h3 className="mt-4 font-display text-2xl text-ink">Start where the work is.</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-muted">Share an update, ask for help or capture a decision. The context stays with this room.</p>
                  </div>
                ) : messages.map((message) => <MessageCard key={message.id} message={message} mine={message.authorUserId === user.id} conversationId={selected.id} />)}
              </div>

              <div className="border-t border-surface-border bg-surface/45 p-4 sm:p-5">
                {replyMessage ? (
                  <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-brand/15 bg-brand-soft/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">Replying to {replyMessage.authorName}</p>
                      <p className="mt-1 truncate text-xs text-ink-muted">{replyMessage.body || "Linked attachment"}</p>
                    </div>
                    <Link href={`/conversations?c=${selected.id}`} className="text-xs text-ink-faint">Cancel</Link>
                  </div>
                ) : null}
                <form action={sendMessageAction} className="rounded-2xl border border-surface-border bg-surface-raised p-3 shadow-sm">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <input type="hidden" name="replyToMessageId" value={replyMessage?.id ?? ""} />
                  <textarea name="body" rows={3} maxLength={8000} placeholder={`Message ${selected.title}`} className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint" />
                  <details className="mt-2 border-t border-surface-border/70 pt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-faint hover:text-brand">Attach a secure HTTPS link</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input name="attachmentLabel" maxLength={120} placeholder="Link label" className="rounded-xl border border-surface-border bg-surface px-3 py-2 text-xs outline-none focus:border-brand/40" />
                      <input name="attachmentUrl" type="url" placeholder="https://…" className="rounded-xl border border-surface-border bg-surface px-3 py-2 text-xs outline-none focus:border-brand/40" />
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-ink-faint">Phase 2 stores link metadata only. Permanent binary files are not written to local application disks.</p>
                  </details>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-ink-faint">Internal · membership scoped</p>
                    <button className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-muted">Send</button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex min-h-[690px] items-center justify-center p-8 text-center">
              <div className="max-w-lg"><p className="font-display text-3xl text-ink">Your team now has a place to talk.</p><p className="mt-3 text-sm leading-6 text-ink-muted">Start a direct conversation or create a private working Circle from the people panel.</p></div>
            </div>
          )}
        </main>

        <aside className="border-t border-surface-border bg-surface/55 xl:border-l xl:border-t-0">
          <div className="space-y-6 p-4">
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Start a conversation</p>
              <form action={createDirectAction} className="mt-3 space-y-2">
                <select name="otherUserId" required className="w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 text-xs text-ink outline-none focus:border-brand/40">
                  <option value="">Choose a team member</option>
                  {directory.map((member) => <option key={member.id} value={member.id}>{member.name} · {humanRole(member.role)}</option>)}
                </select>
                <button className="w-full rounded-xl border border-brand/20 bg-brand-soft/45 px-3 py-2 text-xs font-semibold text-brand-muted hover:bg-brand-soft/65">Direct message</button>
              </form>
            </section>

            <section className="border-t border-surface-border pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Private working Circle</p>
              <form action={createCircleAction} className="mt-3 space-y-2">
                <input name="title" required minLength={2} maxLength={80} placeholder="e.g. Payments Operations" className="w-full rounded-xl border border-surface-border bg-surface-raised px-3 py-2.5 text-xs outline-none focus:border-brand/40" />
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-surface-border bg-surface-raised p-2">
                  {directory.map((member) => <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-muted hover:bg-surface-soft/60"><input type="checkbox" name="memberUserIds" value={member.id} className="accent-brand" /><span className="truncate">{member.name}</span></label>)}
                </div>
                <button className="w-full rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-brand-muted">Create Circle</button>
              </form>
            </section>

            {selected ? (
              <>
                <section className="border-t border-surface-border pt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">People here</p>
                  <div className="mt-3 space-y-2">
                    {selected.participants.slice(0, 8).map((participant) => <div key={participant.id} className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft/55 text-[10px] font-semibold text-brand-muted">{initials(participant.name)}</span><div className="min-w-0"><p className="truncate text-xs font-medium text-ink">{participant.name}</p><p className="truncate text-[10px] text-ink-faint">{humanRole(participant.role)}</p></div></div>)}
                  </div>
                </section>

                <section className="border-t border-surface-border pt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Action drafts</p>
                  <p className="mt-2 text-[11px] leading-5 text-ink-muted">Conversation intent only. Phase 3+ decides whether a real work object can be created.</p>
                  <div className="mt-3 space-y-2">
                    {drafts.length === 0 ? <p className="text-xs text-ink-faint">No work drafts from this room yet.</p> : drafts.slice(0, 6).map((draft) => <div key={draft.id} className="rounded-xl border border-surface-border bg-surface-raised px-3 py-2"><p className="text-xs font-semibold text-ink">{humanAction(draft.actionType)}</p><p className="mt-0.5 text-[10px] text-ink-faint">Drafted by {draft.createdByName}</p></div>)}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ConversationLink({ conversation, selected }: { conversation: ConversationSummary; selected: boolean }) {
  return <Link href={`/conversations?c=${conversation.id}`} className={`block rounded-2xl border px-3 py-3 transition ${selected ? "border-brand/20 bg-brand-soft/45" : "border-transparent hover:border-surface-border hover:bg-surface-raised"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm ${conversation.type === "COMPANY" ? "bg-brand text-white" : "bg-surface-soft text-ink-muted"}`}>{conversation.type === "DIRECT" ? "↔" : conversation.type === "COMPANY" ? "✦" : "○"}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className={`truncate text-sm font-semibold ${selected ? "text-brand-muted" : "text-ink"}`}>{conversation.title}</p>{conversation.unreadCount > 0 ? <span className="flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span> : null}</div><p className="mt-1 truncate text-xs text-ink-faint">{conversation.latestBody || roomHelper(conversation.type)}</p>{conversation.pinnedCount > 0 ? <p className="mt-1 text-[10px] text-brand">{conversation.pinnedCount} pinned</p> : null}</div></div></Link>;
}

function MessageCard({ message, mine, conversationId }: { message: StaffMessage; mine: boolean; conversationId: string }) {
  return <article className={`group flex gap-3 ${mine ? "sm:pl-12" : "sm:pr-12"}`} id={`message-${message.id}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${mine ? "bg-brand text-white" : "bg-surface-soft text-ink-muted"}`}>{initials(message.authorName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><p className="text-xs font-semibold text-ink">{message.authorName}</p><time className="text-[10px] text-ink-faint">{formatTime(message.createdAt)}</time>{message.pinned ? <span className="rounded-full bg-brand-soft/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-brand-muted">Pinned</span> : null}</div><div className={`mt-1.5 rounded-2xl border px-4 py-3 ${mine ? "border-brand/15 bg-brand-soft/26" : "border-surface-border bg-surface"}`}>{message.replyBody ? <div className="mb-2 rounded-xl border-l-2 border-brand bg-surface-raised/80 px-3 py-2 text-[11px] text-ink-muted"><p className="font-semibold text-brand-muted">{message.replyAuthorName}</p><p className="mt-0.5 line-clamp-2">{message.replyBody}</p></div> : null}{message.body ? <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{message.body}</p> : null}{message.attachment ? <a href={message.attachment.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-raised px-3 py-2 text-xs text-brand hover:border-brand/30"><span className="truncate">↗ {message.attachment.label}</span><span className="text-[10px] text-ink-faint">HTTPS</span></a> : null}</div><div className="mt-2 flex flex-wrap items-center gap-1.5">{REACTIONS.map((emoji) => { const reaction = message.reactions.find((item) => item.emoji === emoji); return <form key={emoji} action={toggleReactionAction}><input type="hidden" name="conversationId" value={conversationId} /><input type="hidden" name="messageId" value={message.id} /><input type="hidden" name="emoji" value={emoji} /><button title={`React ${emoji}`} className={`rounded-full border px-2 py-1 text-[11px] transition ${reaction?.mine ? "border-brand/25 bg-brand-soft/55" : "border-surface-border bg-surface-raised hover:border-brand/25"}`}>{emoji}{reaction ? ` ${reaction.count}` : ""}</button></form>; })}<Link href={`/conversations?c=${conversationId}&reply=${message.id}`} className="rounded-full px-2 py-1 text-[10px] font-semibold text-ink-faint hover:text-brand">Reply</Link><form action={togglePinAction}><input type="hidden" name="conversationId" value={conversationId} /><input type="hidden" name="messageId" value={message.id} /><button className="rounded-full px-2 py-1 text-[10px] font-semibold text-ink-faint hover:text-brand">{message.pinned ? "Unpin" : "Pin"}</button></form><details className="relative"><summary className="cursor-pointer list-none rounded-full px-2 py-1 text-[10px] font-semibold text-ink-faint hover:text-brand">Turn into…</summary><div className="absolute bottom-7 left-0 z-20 w-36 rounded-xl border border-surface-border bg-surface-raised p-1.5 shadow-float">{ACTION_DRAFTS.map(([value, label]) => <form key={value} action={createActionDraftAction}><input type="hidden" name="conversationId" value={conversationId} /><input type="hidden" name="messageId" value={message.id} /><input type="hidden" name="actionType" value={value} /><button className="w-full rounded-lg px-2.5 py-2 text-left text-[11px] text-ink-muted hover:bg-surface-soft/60 hover:text-ink">{label} draft</button></form>)}</div></details></div></div></article>;
}

function RoomBadge({ type }: { type: string }) { const label = type === "DIRECT" ? "DM" : type === "COMPANY" ? "Company" : type === "STAFF_CIRCLE" ? "Circle" : "Group"; return <span className="rounded-full bg-surface-soft px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</span>; }
function Notice({ children, tone }: { children: React.ReactNode; tone: "error" | "good" }) { return <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${tone === "error" ? "border-status-bad/20 bg-status-bad/10 text-status-bad" : "border-brand/15 bg-brand-soft/35 text-brand-muted"}`}>{children}</div>; }
function scalar(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SP"; }
function humanRole(role: string): string { return role.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function humanAction(action: string): string { return action.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function roomHelper(type: string): string { if (type === "COMPANY") return "The whole SecurePay staff team"; if (type === "DIRECT") return "Private direct conversation"; if (type === "STAFF_CIRCLE") return "Private working Circle"; return "Private group conversation"; }
function formatTime(value: Date): string { return new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

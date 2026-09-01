import { resolvePlugMarketConnection } from "@/lib/market-network/plug-market-connection";
import { humanRequestType, marketRelationshipBoundary } from "@/lib/market-network/customer-market-foundation";
import { SecurePayMarketRequestError } from "@/lib/market-network/securepay-plug-market-client";

export async function PlugRelationshipsPanel() {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") return null;

  try {
    const relationships = await connection.client.getPlugRelationships();
    return (
      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-brand">Selected relationships</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Customers who explicitly chose to work with you</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
            These appear only after the customer selected your accepted interest and explicitly opened the relationship. Outreach does not reveal the customer&apos;s name, KS Number or contact details here.
          </p>
        </div>

        {relationships.length === 0 ? (
          <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <p className="text-sm font-semibold text-ink">No active customer relationships yet</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Expressing interest in an opportunity does not create a relationship. A customer must choose you and open it through SecurePay.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {relationships.map((relationship) => (
              <article key={relationship.relationshipRef} className="rounded-xl border border-status-good/20 bg-status-good/5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">{humanRequestType(relationship.requestType)}</p>
                    <h3 className="mt-1 text-base font-semibold text-ink">Customer relationship opened</h3>
                  </div>
                  <span className="rounded-full border border-status-good/30 bg-status-good/10 px-3 py-1 text-xs font-semibold text-status-good">Active</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-muted">Recorded {formatDateTime(relationship.openedAt)}.</p>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  {relationship.contactExchangeAvailable
                    ? "SecurePay reports contact exchange as available, but this Outreach slice exposes no contact data."
                    : marketRelationshipBoundary.contactClosed}
                </p>
                <p className="mt-3 border-t border-status-good/15 pt-3 text-xs leading-5 text-ink-faint">
                  {marketRelationshipBoundary.explanation}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="rounded-xl border border-status-warn/25 bg-status-warn/5 p-5">
        <p className="text-sm font-semibold text-ink">Relationship authority is temporarily unavailable</p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          {error instanceof SecurePayMarketRequestError && error.status === 401
            ? "Your SecurePay market session is no longer authorised."
            : "Outreach will not substitute opportunity interest for a confirmed customer relationship."}
        </p>
      </section>
    );
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "when SecurePay opened it";
  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  });
}

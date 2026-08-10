// Every vendor SDK call must live behind this interface — see ADR-001 and
// ADR-002. Application code never imports a vendor SDK directly; it only
// ever talks to src/lib/ai/gateway.ts.
export interface ProviderAdapter {
  readonly providerKey: string;
  readonly envVar: string;
  hasCredentials(): boolean;
}

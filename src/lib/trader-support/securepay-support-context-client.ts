export interface SecurePaySupportNextAction {
  actionCode: string;
  reason: string;
  deadline: string | null;
  attentionClass: string;
}

export interface SecurePaySupportCompletion {
  completed: boolean;
  status: string;
  reasonCodes: string[];
  completedAt: string | null;
}

export interface SecurePaySupportAgreementContext {
  publicReference: string;
  title: string;
  status: string;
  agreementType: string;
  participantRole: string | null;
  participantStatus: string | null;
  nextDeadline: string | null;
  attentionRequired: boolean;
  nextActions: SecurePaySupportNextAction[];
  completion: SecurePaySupportCompletion;
}

export interface SecurePaySupportContext {
  traderRef: string;
  traderDisplayName: string | null;
  identityStatus: string;
  agreements: SecurePaySupportAgreementContext[];
  caseRef: string;
  retrievedAt: string;
}

export class SecurePaySupportContextError extends Error {
  constructor(readonly status: number) {
    super("SecurePay support context is unavailable");
    this.name = "SecurePaySupportContextError";
  }
}

/**
 * Purpose-limited SecurePay support client.
 *
 * The caller token stays server-side. Outreach consumes the backend projection as read-only truth
 * and does not persist, broaden, or infer authority from the response.
 */
export class SecurePaySupportContextClient {
  constructor(private readonly options: { baseUrl: string; accessToken: string }) {}

  async read(traderRef: string, caseRef: string): Promise<SecurePaySupportContext> {
    const response = await fetch(
      `${this.options.baseUrl.replace(/\/$/, "")}/support/context/${encodeURIComponent(traderRef)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.options.accessToken}`,
          "X-Outreach-Case-Ref": caseRef,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new SecurePaySupportContextError(response.status);
    }
    return (await response.json()) as SecurePaySupportContext;
  }
}

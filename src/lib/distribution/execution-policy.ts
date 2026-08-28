export class DistributionExecutionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistributionExecutionPolicyError";
  }
}

export interface DistributionExecutionWindow {
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * Fail closed outside the human-approved distribution window. The caller
 * supplies `now` so tests can be deterministic and no adapter can redefine
 * the campaign's authorised timing.
 */
export function assertExecutionWindow(
  window: DistributionExecutionWindow,
  now = new Date()
): void {
  if (window.startDate && now < window.startDate) {
    throw new DistributionExecutionPolicyError(
      `Distribution cannot start before ${window.startDate.toISOString()}.`
    );
  }
  if (window.endDate && now > window.endDate) {
    throw new DistributionExecutionPolicyError(
      `Distribution window ended at ${window.endDate.toISOString()}.`
    );
  }
  if (window.startDate && window.endDate && window.endDate < window.startDate) {
    throw new DistributionExecutionPolicyError(
      "Distribution end date cannot be earlier than its start date."
    );
  }
}

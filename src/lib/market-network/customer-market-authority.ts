import { resolvePlugMarketConnection } from "./plug-market-connection";
import {
  SecurePayMarketRequestError,
  type CustomerMarketRequest,
} from "./securepay-plug-market-client";

export type CustomerMarketAuthority =
  | { status: "CONNECTED"; requests: CustomerMarketRequest[] }
  | { status: "UNAVAILABLE"; requests: []; reason: string };

export async function getCustomerMarketAuthority(): Promise<CustomerMarketAuthority> {
  const connection = await resolvePlugMarketConnection();
  if (connection.status !== "CONNECTED") {
    return {
      status: "UNAVAILABLE",
      requests: [],
      reason:
        connection.status === "BASE_URL_UNCONFIGURED"
          ? "SecurePay Market Network is not configured in this environment."
          : "Your SecurePay market identity is not connected in this session.",
    };
  }

  try {
    return {
      status: "CONNECTED",
      requests: await connection.client.getMyCustomerRequests(),
    };
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      requests: [],
      reason:
        error instanceof SecurePayMarketRequestError && error.status === 401
          ? "Your SecurePay market session has expired."
          : "SecurePay customer-market authority could not be read right now.",
    };
  }
}

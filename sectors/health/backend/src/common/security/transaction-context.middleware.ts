/**
 * TransactionContext — AsyncLocalStorage holder for the current
 * TransactionEnvelope. Bound per-request by the global TransactionInterceptor.
 *
 * Services / adapters call TransactionContext.current() to read the envelope
 * and TransactionContext.require() to fail-closed if none is present.
 */
import { AsyncLocalStorage } from "async_hooks";
import { Injectable } from "@nestjs/common";
import { TransactionEnvelope } from "../../integrations/beyu/shared/transaction-envelope";

@Injectable()
export class TransactionContext {
  private readonly als = new AsyncLocalStorage<TransactionEnvelope>();

  run<T>(envelope: TransactionEnvelope, fn: () => T): T {
    return this.als.run(envelope, fn);
  }

  current(): TransactionEnvelope | null {
    return this.als.getStore() ?? null;
  }

  /** Fail-closed accessor. Throws NO_TRANSACTION_CONTEXT if invoked outside
   *  a governed mutating request. */
  require(): TransactionEnvelope {
    const env = this.current();
    if (!env) {
      throw new Error(
        "NO_TRANSACTION_CONTEXT: governed operation must have a TransactionEnvelope bound",
      );
    }
    return env;
  }
}

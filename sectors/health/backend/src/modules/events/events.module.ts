/**
 * Governed event delivery module (Phase 8).
 *
 * EventOutboxService  — the transactional outbox writer: business code
 *                       publishes events INSIDE its business transaction.
 * OutboxDispatcherService — at-least-once delivery of due outbox rows to
 *                       BEYU OS through authenticated governed transport,
 *                       with exponential backoff + jitter, a dead-letter
 *                       terminal state and lease-based multi-instance
 *                       claiming. Exactly-once business effect is enforced
 *                       by BEYU OS idempotency receipts.
 */
import { Global, Module } from "@nestjs/common";
import { EventOutboxService } from "./event-outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OutboxOpsService } from "./outbox-ops.service";
import { OutboxOpsController } from "./outbox-ops.controller";

@Global()
@Module({
  providers: [EventOutboxService, OutboxDispatcherService, OutboxOpsService],
  controllers: [OutboxOpsController],
  exports: [EventOutboxService, OutboxDispatcherService, OutboxOpsService],
})
export class EventsModule {}

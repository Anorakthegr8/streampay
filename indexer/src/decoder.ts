import { xdr, scValToNative } from "@stellar/stellar-sdk";
import type { DecodedEvent, EventValue, RpcEvent } from "./types.js";
import { EVENT_SHAPES, isContractEventName } from "./generated/events.js";

function decodeScVal(encoded: unknown): EventValue {
  if (typeof encoded === "string") {
    return scValToNative(xdr.ScVal.fromXDR(encoded, "base64")) as EventValue;
  }
  if (typeof encoded === "object" && encoded !== null && "xdr" in encoded && typeof (encoded as { xdr: string }).xdr === "string") {
    return scValToNative(xdr.ScVal.fromXDR((encoded as { xdr: string }).xdr, "base64")) as EventValue;
  }
  return scValToNative(encoded as Parameters<typeof scValToNative>[0]) as EventValue;
}

function record(value: EventValue): Record<string, EventValue> {
  if (value instanceof Map) {
    const obj: Record<string, EventValue> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = v as EventValue;
    }
    return obj;
  }
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Expected event data to decode to a map");
  }
  return value as Record<string, EventValue>;
}

/**
 * Decode one RPC event. Registry-known events (schemas/events/) are validated
 * field-for-field against the generated shape table: the positional topic
 * layout must match the registry and every declared data field must be
 * present, so an event-shape drift fails loudly here instead of silently
 * corrupting indexed state. Unknown names (other contracts, events predating
 * the registry) fall back to the historical `[name, stream_id, …]` handling.
 */
export function decodeEvent(event: RpcEvent): DecodedEvent {
  if (!event.topic || event.topic.length < 1) throw new Error(`Event ${event.id} has no topic`);
  const topics = event.topic.map((t) => decodeScVal(t));
  const name = topics[0];
  if (typeof name !== "string") {
    throw new Error(`Event ${event.id} has a non-symbol name topic`);
  }

  let streamId: string | undefined;
  if (isContractEventName(name)) {
    const shape = EVENT_SHAPES[name];
    const positional = topics.slice(1);
    if (positional.length !== shape.topics.length) {
      throw new Error(
        `Event ${event.id} (${name}) has ${positional.length} positional topic(s), registry declares ${shape.topics.length} — schema drift, check schemas/events/${name}.json`
      );
    }
    shape.topics.forEach((field, i) => {
      if (field.name === "stream_id") streamId = String(positional[i]);
    });
    const data = record(decodeScVal(event.value));
    const missing = shape.data.filter((f) => !(f.name in data)).map((f) => f.name);
    if (missing.length > 0) {
      throw new Error(`Event ${event.id} (${name}) is missing registry data field(s): ${missing.join(", ")}`);
    }
    return buildDecoded(event, name, streamId ?? String(positional[0] ?? ""), data);
  }

  if (topics.length < 2) throw new Error(`Event ${event.id} has no stream id topic`);
  const streamIdValue = topics[1];
  if (typeof streamIdValue !== "bigint" && typeof streamIdValue !== "number" && typeof streamIdValue !== "string") {
    throw new Error(`Event ${event.id} has an unexpected topic shape`);
  }
  return buildDecoded(event, name, String(streamIdValue), record(decodeScVal(event.value)));
}

function buildDecoded(
  event: RpcEvent,
  name: string,
  streamId: string,
  data: Record<string, EventValue>
): DecodedEvent {
  const rawTx = event.txHash ?? event.transactionHash;
  return {
    id: event.id,
    pagingToken: event.pagingToken ?? String(event.ledger),
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    contractId: event.contractId,
    name,
    streamId,
    data,
    txHash: rawTx ? String(rawTx) : undefined,
  };
}

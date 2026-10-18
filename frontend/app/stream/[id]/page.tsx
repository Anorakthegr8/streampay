"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getAddress, isConnected } from "@stellar/freighter-api";
import {
  cancelStream,
  describeError,
  isNativeXlm,
  readAvailable,
  readStream,
  withdrawFromStream,
  withdrawMaxFromStream,
  type StreamView,
} from "@/lib/stellar";
import {
  INITIAL_STATE,
  startLiveAccrual,
  type LiveAccrual,
  type LiveAccrualState,
} from "@/lib/live-accrual";
import { useToast } from "@/components/toast";

function fmtUnits(v: bigint): string {
  return v.toString();
}

export default function StreamDetail() {
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [stream, setStream] = useState<StreamView | null>(null);
  const [live, setLive] = useState<LiveAccrualState>(INITIAL_STATE);
  const [amount, setAmount] = useState<string>("");
  const [address, setAddress] = useState<string | null>(null);
  const engineRef = useRef<LiveAccrual | null>(null);

  useEffect(() => {
    if (!id) return;
    const engine = startLiveAccrual({
      readStream: async () => {
        const s = await readStream(id);
        setStream(s);
        return {
          deposit: BigInt(s.deposit),
          startTime: s.startTime,
          endTime: s.endTime,
          withdrawn: BigInt(s.withdrawn),
          status: s.status,
        };
      },
      readAvailable: () => readAvailable(id),
      onUpdate: setLive,
    });
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.stop();
    };
  }, [id]);

  const available = live.available;
  const snapshot = live.snapshot;
  const displayAvailable = live.displayAvailable;
  const loadError = live.error ? describeError(live.error) : "";

  useEffect(() => {
    if (live.error) toast.error(describeError(live.error));
  }, [live.error, toast]);

  useEffect(() => {
    void (async () => {
      try {
        if (await isConnected()) {
          const { address } = await getAddress();
          setAddress(address);
        }
      } catch {
        // Detail view stays read-only without a wallet.
      }
    })();
  }, []);

  if (loadError && !stream) {
    return (
      <main className="wrap">
        <h1>Stream #{id}</h1>
        <p className="err">{loadError}</p>
        <Link href="/">← All streams</Link>
      </main>
    );
  }
  if (!stream) {
    return (
      <main className="wrap">
        <h1>Stream #{id}</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const deposit = BigInt(stream.deposit);
  const withdrawn = BigInt(stream.withdrawn);
  const progress =
    deposit > 0n ? Math.min(100, Number((withdrawn * 100n) / deposit)) : 0;
  const isRecipient = address !== null && address === stream.recipient;
  const isSender = address !== null && address === stream.sender;
  const overWithdrawal =
    available !== null && amount !== "" && BigInt(amount || "0") > available;

  async function doWithdraw(max: boolean) {
    if (!address) return;
    try {
      if (max) {
        const paid = await withdrawMaxFromStream(address, stream!.id);
        toast.success(`Claimed ${fmtUnits(paid)} units.`);
      } else {
        if (overWithdrawal) {
          toast.error(
            `Amount exceeds the accrued balance (${available?.toString()} units). Try “Withdraw max”.`
          );
          return;
        }
        await withdrawFromStream(address, stream!.id, amount || "0");
        toast.success("Withdrawal sent.");
      }
      setAmount("");
      await engineRef.current?.refresh();
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  async function doCancel() {
    if (!address) return;
    try {
      await cancelStream(address, stream!.id);
      toast.success("Stream cancelled.");
      await engineRef.current?.refresh();
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  return (
    <main className="wrap">
      <p className="kicker mono">STREAM #{stream.id}</p>
      <h1>
        {stream.status === "Active" ? "⚡ Streaming" : `⏹ ${stream.status}`}
      </h1>

      <section className="card">
        <div className="row">
          <progress value={progress} max={100} style={{ flex: 1 }} />
          <span className="mono">{progress}% withdrawn</span>
        </div>
        <table>
          <tbody>
            <tr>
              <th>Sender</th>
              <td className="mono">{stream.sender}</td>
            </tr>
            <tr>
              <th>Recipient</th>
              <td className="mono">{stream.recipient}</td>
            </tr>
            <tr>
              <th>Token</th>
              <td className="mono" style={{ wordBreak: "break-all" }}>
                {isNativeXlm(stream.token)
                  ? `Native XLM — ${stream.token}`
                  : stream.token}
              </td>
            </tr>
            <tr>
              <th>Deposit</th>
              <td className="mono">{stream.deposit}</td>
            </tr>
            <tr>
              <th>Withdrawn</th>
              <td className="mono">{stream.withdrawn}</td>
            </tr>
            <tr>
              <th>Available now</th>
              <td className="mono">
                {snapshot?.status === "Active"
                  ? (displayAvailable ?? available)?.toString() ?? "…"
                  : available?.toString() ?? "…"}
              </td>
            </tr>
            <tr>
              <th>Window</th>
              <td className="mono">
                {new Date(stream.startTime * 1000).toISOString()} →{" "}
                {new Date(stream.endTime * 1000).toISOString()}
              </td>
            </tr>
            <tr>
              <th>Cancelable</th>
              <td>{String(stream.cancelable)}</td>
            </tr>
            <tr>
              <th>Status</th>
              <td>{stream.status}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {isRecipient && stream.status === "Active" && (
        <section className="card">
          <h2>Withdraw accrued funds</h2>
          <div className="row">
            <input
              type="number"
              min="0"
              placeholder="amount (defaults to available)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button onClick={() => void doWithdraw(false)}>Withdraw</button>
            <button
              onClick={() => void doWithdraw(true)}
              title="withdraw_max: atomic claim of the full accrued balance"
            >
              Withdraw max
            </button>
          </div>
          {overWithdrawal && (
            <p className="err">
              That exceeds the currently accrued {available?.toString()} units —
              the contract would reject it with AmountExceedsAvailable.
            </p>
          )}
        </section>
      )}

      {(isSender || (isRecipient && stream.cancelable)) &&
        stream.status === "Active" && (
          <section className="card">
            <h2>Cancel stream</h2>
            <p className="muted">
              Pays the recipient everything accrued and refunds the sender the
              rest, atomically. This is irreversible.
            </p>
            <button onClick={() => void doCancel()}>Cancel stream</button>
          </section>
        )}

      <section className="card">
        <h2>Shareable Payment Link</h2>
        <p className="muted">
          Generate a deterministic, privacy-blinded claim URL for this stream. The recipient can claim without logging in first.
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              const { encodePaymentLinkRef } = await import("@/lib/payment-link");
              const ref = await encodePaymentLinkRef({
                streamId: stream.id,
                recipient: stream.recipient,
              });
              const url = `${window.location.origin}/pay/${ref}`;
              await navigator.clipboard.writeText(url);
              toast.success("Payment link copied to clipboard!");
            } catch (err: unknown) {
              toast.error(`Failed to copy payment link: ${String(err)}`);
            }
          }}
        >
          Copy Shareable Payment Link
        </button>
      </section>

      <p>
        <Link href="/">← All streams</Link>
      </p>
    </main>
  );
}

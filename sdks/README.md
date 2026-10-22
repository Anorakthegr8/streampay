# StreamPay client SDKs

Typed clients for the StreamPay Soroban contract, generated from one canonical
spec.

This change lands the shared layer only: the contract-derived spec, the schema
guard, the error-catalog wiring, and the generator. The TypeScript SDK follows
in the next PR; the Rust and Python SDKs follow per language so each package can
be reviewed against the same spec on its own.

## Layout

```text
sdks/
  spec/streampay.spec.json     canonical contract IR + sha256 fingerprint
  spec/FINGERPRINT             sha256 of the canonical JSON
  generator/check_contract_surface.py
                               derives the IR from the Rust contract; coverage tests
  generator/generate.py        IR -> the language emitters
  Makefile                     generate / check
```

Language packages add `typescript/`, `rust/`, or `python/` alongside these
files. The generator only emits a language whose package is present, so a
language PR adds its emitter and generated artifacts together.

## The contract is the source of truth

`sdks/spec/streampay.spec.json` is checked in, but it is **derived**, not
hand-maintained:

```bash
python3 sdks/generator/check_contract_surface.py --write-spec
```

parses `contracts/streaming-payments/src/*.rs` and rewrites the IR from the
contract's own surface:

* every `pub fn` in the `#[contractimpl]` block (the deploy-time
  `__constructor` is not a client operation), with ordered arguments, argument
  types, return types, and fallibility
* every `#[contracttype]` struct/enum reachable from an entrypoint or event
* event names, topic symbols, topic fields, and data fields
* numeric constants clients need (`MAX_PAGE_SIZE`, `MAX_BATCH`, fee bounds, …)

The normal (no-flag) run is the CI gate: it re-derives the IR and reports any
drift. `sdks/generator/test_contract_surface.py` additionally fails when the
spec's operation set is smaller than the contract's, and when an entrypoint
named by the contract's own `surface.rs` branch registry is missing. That makes
the coverage claim structural: adding a contract entrypoint without extending
the spec is a red build, not a documentation bug.

### Error codes come from the catalog

The generator does **not** restate `StreamError`. It reads the canonical catalog
in `frontend/lib/errors.ts`, which `tooling/generate-error-catalog.mjs`
generates from `contracts/streaming-payments/src/errors.rs` and CI already gates
for drift. A new error code therefore reaches an SDK by regenerating the
catalog, and the SDK regeneration check fails until the client is refreshed.

## Generation, not hand-writing

```bash
make -C sdks generate      # rewrite the generated language files
make -C sdks check         # guard + coverage tests + "regeneration is a no-op"
```

Generated files carry the spec fingerprint in their header. Hand edits inside a
generated file are overwritten; behaviour belongs in the runtime files or the
spec.

## Versioning policy

Every SDK tracks the contract release line (currently `0.3.0`) and shares one
version across languages.

* **Patch** (`0.3.1`): runtime/documentation fixes, no wire changes.
* **Minor** (`0.4.0`): new contract entrypoints/events/errors, or additive SDK
  helpers. Previously generated code keeps working because Soroban only appends
  API surface.
* **Major** (`1.0.0`): breaking wire changes, including removals, renames,
  re-typed arguments/returns, renumbered errors, or event topic changes. While
  in `0.x`, a breaking contract change bumps the **minor** position and is
  called out in `CHANGELOG.md`.
* Published versions are immutable; deprecate rather than overwrite.
* `SPEC_FINGERPRINT` is exported by every SDK. Indexers and bots can assert it
  matches the deployment they are talking to.

## Publishing

None of the packages is on a public registry. If the project decides to publish
one, the StreamPay maintainers (the Neziahtech organisation owners) own the
release: they hold any registry scope and decide the release path. An SDK PR
does not publish or claim a registry presence.

# Test coverage & error paths

Visible map of the Soroban suite (`contracts/celerity/src/test.rs`) against
contract `Error` codes and the non-negotiable design rules in
[`PROJECT.md`](PROJECT.md).

**Prove green:** from repo root, `cargo test -p celerity` → **57/57**.

```bash
cargo test -p celerity -- --list   # names below
```

---

## Suite at a glance

| Area | Tests (happy + adversarial) | Design rule hit |
| --- | ---: | --- |
| Deposit / top-up / withdraw / pause | 18 | Funder isolation, auth |
| Farmer registry | 8 | Human judgment stays with admin |
| Oracle `report_event` | 7 | Signature + numbers only; 2-of-3 |
| Settle (multi-pool, dry, idempotent) | 9 | Flag-not-fail; settled-key |
| Claim / installments / expiry / admin | 15 | Schedule + auth + rotation |
| **Total** | **57** | |

Host **auth failures** (not `Error` enum) are asserted via `auth_err()` —
stranger cannot top-up / withdraw / pause / resume another’s pool; non-admin
cannot register/remove; farmer must authorize `claim`; deposit requires funder auth.

---

## Error-path matrix

Every `Error` variant the contract can raise after a successful constructor,
plus constructor-only codes.

| Code | `Error` | When it fires | Covered by |
| ---: | --- | --- | --- |
| 3 | `PoolNotFound` | Missing pool on top-up / withdraw / pause / view | `top_up_rejects_invalid_amount_and_missing_pool`, `withdraw_and_pause_missing_pool_fail_cleanly`, `missing_pool_and_farmer_views_error_cleanly` |
| 4 | `FarmerNotFound` | View / remove / claim on unknown or removed farmer | `missing_pool_and_farmer_views_error_cleanly`, `remove_farmer_clears_registry_and_region_list`, `claim_without_settlement_or_registration_fails`, `removed_farmer_cannot_claim_remaining_installments` |
| 5 | `FarmerAlreadyRegistered` | Duplicate `register_farmer` | `duplicate_registration_fails` |
| 6 | `InvalidAmount` | Zero/negative deposit or top-up | `deposit_rejects_invalid_args`, `top_up_rejects_invalid_amount_and_missing_pool` |
| 7 | `InvalidPayout` | Zero payout-per-farmer | `deposit_rejects_invalid_args` |
| 8 | `InvalidInstallments` | Zero installments | `deposit_rejects_invalid_args` |
| 9 | `PoolNotPaused` | `resume` on Active / Exhausted | `resume_only_works_from_paused` |
| 10 | `NonceAlreadyUsed` | Replay of same oracle nonce | `replayed_event_is_rejected` |
| 11 | `EventNotFound` | Missing event view / settle unknown | `missing_event_view_errors_cleanly`, `tampered_event_is_rejected` (side effect), `settle_unknown_event_and_empty_region_are_safe` |
| 12 | `InvalidPeriod` | Recurring deposit with `claim_period_secs == 0` | `recurring_deposit_requires_nonzero_period` |
| 13 | `PoolPaused` | `claim` while paused | `paused_pool_blocks_claim_and_resume_unblocks` |
| 14 | `PoolUnderfunded` | Claim when balance &lt; installment | `underfunded_claim_fails_and_topup_cures_it` |
| 15 | `NothingToClaim` | Claim without prior settle / no progress | `claim_without_settlement_or_registration_fails` |
| 16 | `AllInstallmentsPaid` | Claim after last installment | `claim_stops_after_last_installment_and_schedule_advances` |
| 17 | `ClaimNotDueYet` | Claim before period elapses | `claim_before_due_fails`, `claim_stops_after_last_installment_and_schedule_advances` |
| 18 | `RegionMismatch` | Claim after re-register in new region | `reregister_in_new_region_cannot_claim_old_pool` |
| 19 | `NotExpiredYet` | Withdraw before `trigger_expiry` | `expiry_blocks_early_withdraw_and_allows_after` |
| 20 | `InsufficientOracleSigs` | Below 2-of-3 threshold | `one_oracle_sig_is_insufficient` |
| — | *(auth, not Error)* | Wrong invoker | `*_without_auth_*`, `stranger_cannot_*`, `non_admin_cannot_*`, `claim_requires_the_farmers_own_auth` |
| — | *(sig verify trap / reject)* | Bad or foreign key | `tampered_event_is_rejected`, `event_from_unauthorized_key_is_rejected` |

### Constructor-only (not hit by post-deploy unit tests)

| Code | `Error` | Notes |
| ---: | --- | --- |
| 2 | `NotInitialized` | Storage read before constructor — impossible after atomic deploy |
| 21 | `InvalidOracleConfig` | Empty keys, threshold 0, threshold &gt; key count, duplicate keys — rejected in `__constructor` |

Those two are **deploy-time** guards. The live Testnet deploy uses a 3-key set with
threshold 2; misconfig fails the deploy tx rather than leaving a half-live contract.

---

## Money-shot paths (must stay green)

| Behavior | Test |
| --- | --- |
| One event → ≥2 independent funders pay one farmer | `one_event_releases_two_funders_to_one_farmer` |
| Settle twice → pay exactly once | `settle_twice_pays_exactly_once` |
| Dry pool flagged; solvent pools still pay | `dry_pool_flagged_solvent_pools_still_pay` |
| Mid-list exhaustion → partial, then top-up recovers | `midlist_exhaustion_pays_partial_then_recovers_after_topup` |
| Three funders → three separate receipts | `three_funders_one_farmer_three_separate_receipts` |

---

## Formal audit note

Adversarial outside-voice audits were run via Cursor orchestration
(`.cursor/skills/orchestrate/` → Codex `audit` / Claude `claude-audit`) against
contract + frontend. Findings were triaged into this suite (auth, isolation,
idempotency, dry-pool, oracle threshold). Re-run:

```bash
.cursor/skills/orchestrate/scripts/dispatch.sh audit "contracts/celerity + celerity-web money paths"
```

Artifacts land in `.gstack/orchestrate/` (gitignored).

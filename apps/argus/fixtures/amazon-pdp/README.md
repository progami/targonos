# Amazon PDP Replica Fixture

Argus renders the PDP inside an iframe using `replica.html` + `listingpage_files/*`.

## Contract (versioned)

The replica must expose a small “contract” that Argus uses for DOM injection/versioning:

- `meta[name="argus-replica-version"]` in `replica.html`
- `data-argus-replica="amazon-pdp-v1"` on `<html>` (set by `argus-replica-v1.js`)
- `data-argus-slot="..."` hooks on key elements (set by `argus-replica-v1.js`)

If the contract is missing/mismatched, Argus shows a **Replica template mismatch** banner instead of partially injecting a broken page.

## Updating the replica (robust)

1. Replace assets under `listingpage_files/` (images/css/js) as needed.
2. Update `replica.html` from the new Amazon download.
3. Re-add these two tags in the `<head>` (and bump version when changing mappings):
   - `meta[name="argus-replica-version"]`
   - `script[src="./argus-replica-vX.js" defer]`
4. If the DOM structure changed, create a new slot binder (e.g. `argus-replica-v2.js`) by updating selectors → slot names.
5. Update Argus to expect the new version (search for `amazon-pdp-v1` in `apps/argus/app/(app)/listings/[id]`).


# S3-2-D1a: product dimensions — TDD evidence

Scope: optional weight/length/width/height in `/admin/products/new` and
`/admin/products/:id`; shared create/update contracts unchanged.

RED: `S3-2-d1a-tdd-red.txt` — 3 failed | 12 passed, implementation
reverted to `5ebfe9c` while the new tests stayed in place.
GREEN: `S3-2-d1a-tdd-green.txt` — 15 passed.

| AC | Test |
|---|---|
| Save weight/dimensions (product-management "Сохранение") | `AdminProductNewPage > sends weight and dimensions as integer grams and centimeters` |
| Reject zero/fractional/too large (product-management "Невалидные") | `AdminProductNewPage > rejects zero, fractional and too large dimensions with field errors` |
| Empty optional dimensions are omitted on create | `AdminProductNewPage > creates a draft, converts rubles with a comma to kopecks and omits empty description` |
| Edit prefill, changed-only PATCH, clear → `null` | `AdminProductEditPage > prefills dimensions, PATCHes changed values and sends null when a field is cleared` |

Verify: `S3-2-d1a-verify.txt` — `pnpm verify` exit 0.

Note: only component tests here; browser e2e/axe/LCP stay in the later
delivery e2e PR per the brief.

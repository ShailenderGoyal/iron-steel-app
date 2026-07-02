# Rohini Ispat — Full Workflow Test Plan

Goal: stop testing features in isolation and instead **run the app the way the business actually will**, end to end, to judge usefulness, find bugs, and spot missing information or screens. Work through the scenarios below in order; after each, jot findings in the **Findings Log** at the bottom.

- **App:** https://iron-steel-app-production.up.railway.app
- **Logins:** `owner1` / `owner2` (owner — sales + full access), `supervisor` (production — no party/pricing).
  ⚠️ Rotate these default passwords first (Settings → Users → Edit).
- **Tip:** keep two browsers (or a normal + incognito window) open so you can be **owner in one and supervisor in the other** at the same time.

For every step, ask the three questions:
1. **Does it work?** (bug / error / wrong number)
2. **Is it useful / clear?** (confusing wording, extra clicks, bad layout)
3. **Is any info missing?** (a number/column/screen you wish were there)

---

## Part A — Real end-to-end scenarios

### Scenario 1 — Owner onboards and takes a first order (the happy path)
Play the **owner** running the shop for the first time.

1. **Settings** → set default unit, working hours, breaks, and the **Min Reusable Coil Width** (e.g. 25 mm). Save.
2. **Suppliers** → add 1–2 suppliers you actually buy from.
3. **Parties** → open a real party (e.g. `AGGARWAL STEELS`). Set its **Default Tolerances** (e.g. Gauge `− under only 0.1`, Width `± 0.2`). Add a preferred size. Save.
4. **Coils** → add a real coil you have in stock (OD/ID/width/gauge, hardness, **rust level**, supplier). Confirm the **auto weight** looks right. Add a couple more coils of different widths/gauges.
5. **Sheets** → add a sheet type or two.
6. **Orders → New Order** → pick that party. **Verify the tolerances prefilled** from the party. Add 2 line items: one **coil** (width + thickness, *no length*) and one **sheet** (width + length + thickness). Set a deadline + priority. Save.

**Verify:** weights, prefilled tolerances, the order card shows both lines. **Note** anything unclear about the order form (too many fields? missing a field like rate/PO number?).

### Scenario 2 — Optimize + cut, with leftover restock
Continue as **owner**, on the coil line from Scenario 1.

1. **Optimization** → select the order + the **coil** line item. Note the "Output: Coil" indicator. Run.
2. Review the options: **wastage %**, **pieces**, **reusable leftover (mm + kg)**, and the **slitter** offered. Pick the best.
3. In **Confirm**: if there's a reusable leftover, choose **Add back to stock**. Read the "coil reduced by … = order + leftover" line — does it match your mental math? Pick a machine + date. Confirm.
4. Go to **Coils** → verify: the **source coil dropped** by (order + leftover), and a **new narrower coil** appeared for the leftover.
5. Repeat for the **sheet** line item — this time watch for the **coil→sheet** option (slit on a slitter, then **cut length on shear _or_ CTL**), or an existing-sheet option. Confirm one and check inventory again.

**Verify:** the numbers reconcile; the leftover coil is real and correctly sized. **Note:** is the restock/scrap choice clear? Would you want to see the leftover's future use suggestions here?

### Scenario 3 — Supervisor runs production (no sales visibility)
Switch to the **supervisor** login.

1. Confirm **Parties is gone** from the menu, orders show **no party name**, and there's **no "New Order"** button.
2. **Production** → see today's plan by machine, capacity bars, and the **CTL ↔ Shearing 2 "shared"** flag. Move a job `planned → in progress → completed`.
3. Update an order's **production status** (pending → in production → ready).

**Verify:** the supervisor can do their whole job **without** seeing customers or pricing. **Note:** anything they *can't* see that they'd actually need on the floor (cut sizes, machine, quantity, deadline)?

### Scenario 4 — Dispatch in parts (back to owner)
As **owner**, take the "ready" order from Scenario 2/3.

1. On the order, click **📦 Dispatch**. Dispatch **part** of a line (e.g. half the kg) with a vehicle number + note. The status should become **Partly Dispatched**, with a shipment logged.
2. Dispatch the **rest** later → status **Dispatched**, two shipments shown, aggregate total correct.

**Verify:** you can't dispatch more than remaining; the shipment history + totals read well. **Note:** would you want a printable **dispatch slip / challan** here? (Not built yet — worth deciding.)

### Scenario 5 — Directional tolerance actually changes the answer
As **owner**:

1. Add two coils identical except gauge — one **0.1 mm under** your target, one **0.1 mm over**.
2. Create an order line at that thickness with **Gauge tol = − (under only)** and optimize → only the **under** coil should appear.
3. Edit the line to **+ (over only)** → only the **over** coil appears; **±** → both.

**Verify:** the optimizer respects the party/line direction. **Note:** is the ± / + / − control understandable to your staff?

### Scenario 6 — Stats after a busy "day"
As **owner**, after Scenarios 1–5, open **Statistics**.

**Verify:** total stock, wastage by month, machine utilization hours, oldest stock, low stock, stock by supplier — do the numbers reflect what you just did? Export a CSV. **Note:** which stat would you look at *daily*, and what's missing (e.g. per-party sales, ₹ values, order fulfilment rate)?

---

## Part B — Deeper area checklists

- **Inventory:** filters (hardness, gauge, rust); remaining-weight bar; edit + delete; **Excel export**; **Print** (is it compact / does it fit?); the Calculator (weight + wastage) matches manual math.
- **Orders:** multi-line orders; editing an existing order; priority/deadline sorting; delete.
- **Optimization:** "no match found" case (order something you have no stock for); a coil narrower than the order (should be excluded); very small cut widths; 2×/3× multiples.
- **Production:** a heavy day that **overflows** capacity; the CTL/Shear2 shared budget when both have jobs; setup-change time.
- **Machines:** deactivate a machine → it disappears from optimization/plan; edit ranges.
- **Settings:** change working hours / breaks → production capacity changes; change scrap cutoff → leftover treated differently.

---

## Part C — Cross-cutting

- **Roles:** re-run any owner action as supervisor and confirm it's blocked (403 or hidden), and vice-versa.
- **Hindi:** labels readable and correct on screen **and on printouts**.
- **Print/Export:** every Print button produces a compact, usable page; every Excel button opens cleanly (Hindi intact).
- **Mobile:** open on a phone — nav drawer, tables→cards, forms all usable.
- **Errors:** bad inputs (negative/zero dims, huge numbers, empty required fields) show a clear message, not a crash.
- **Data safety:** refresh mid-task; log out/in; two people editing at once.

---

## Known / deferred (don't log these as bugs)
- Optimizer does **not** yet filter by **rust level** (rust is tracked + filterable in inventory only).
- No **dispatch slip / challan** print yet.
- No **₹ / pricing** anywhere yet (so no cost/margin stats).
- Leftover restock covers **coils** (from slitting); sheet-length offcuts are still treated as wastage.

---

## Findings Log

Record as you go. Severity: 🔴 blocker · 🟠 bug · 🟡 improvement · 🔵 missing info.

| # | Scenario/Screen | Severity | What happened / what you'd want | 
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

(Send me this filled-in table and I'll turn each row into a fix or an enhancement.)

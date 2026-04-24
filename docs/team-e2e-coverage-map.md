# Team Mode — Product Feature Map & E2E Coverage

> Source: `main` branch at time of analysis.
> Purpose: a complete, user-facing map of "team mode" features, cross-referenced against existing E2E tests, to protect the product during the ongoing frontend/backend separation.

## How to read this document

Each feature block lists:

- **Feature** — what the user-facing action is.
- **User flow** — concrete steps the user takes in the UI.
- **Expected outcome** — what the user perceives as success.
- **Backend dependencies** — the IPC channels / emitters the flow touches (`ipcBridge.team.*` unless noted).
- **E2E coverage** — name of the covering spec on `main`, or **MISSING** with a suggested assertion.

Tests on `main` (the only ones that exist there):

1. `tests/e2e/specs/team-create.e2e.ts`
2. `tests/e2e/specs/team-communication.e2e.ts`
3. `tests/e2e/specs/team-agent-lifecycle.e2e.ts`
4. `tests/e2e/specs/team-whitelist.e2e.ts`

Everything else in this document is **MISSING** on `main`.

---

## A. Team Creation

### A1. Open Create Team modal from sidebar

- **User flow:** in the left sider, locate the "Teams" section → click the `+` button next to the title.
- **Expected outcome:** `TeamCreateModal` appears, centered, with fields "Team name", "Team Leader" (agent grid), and "Workspace (optional)". Create button is disabled.
- **Backend deps:** none (UI-only).
- **E2E coverage:** `team-create.e2e.ts` → `sidebar shows team section with create button`, `clicking + opens create team modal`.

### A2. Validate required fields

- **User flow:** try to click "Create Team" without filling name or picking a leader.
- **Expected outcome:**
  - Empty name → `Message.warning("Please enter a team name")`, focus returns to name input.
  - Missing leader → `Message.warning("Please select a team leader")`.
- **Backend deps:** none; validation is client-side in `TeamCreateModal.handleCreate`.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** assert `arco-message` appears with the correct warning text; assert focus moves to the name input after empty-name submit.

### A3. Select a leader agent card (whitelist enforced)

- **User flow:** open modal → scroll the agent card grid → click a card (cards are rendered with `data-testid="team-create-agent-card-<key>"`).
- **Expected outcome:** card shows selected border and a check-mark badge (`data-testid="team-create-agent-selected-badge-<key>"`). Clicking the same card again deselects it.
- **Backend deps:** card list comes from `useConversationAgents()` filtered by `filterTeamSupportedAgents` → `TEAM_SUPPORTED_BACKENDS = {claude, codex, gemini}`.
- **E2E coverage:** `team-whitelist.e2e.ts` covers "only whitelisted agents in dropdown" using the old Select dropdown. **Gap:** main branch now renders an **agent card grid**, not a Select; the existing whitelist test targets the wrong UI surface and will break the moment the test is re-run.
- **Suggested assertion:** iterate `[data-testid^="team-create-agent-card-"]`, assert each card's key starts with one of `claude|codex|gemini`; assert `qwen` / `codebuddy` cards never appear.

### A4. Pick a workspace folder (optional)

- **User flow:** click the workspace trigger (`data-testid="team-create-workspace-trigger"`) → menu (`data-testid="team-create-workspace-menu"`) opens with recent folders + "Choose a different folder".
- **Expected outcome:** chosen path appears in the input; creation can proceed with or without a path.
- **Backend deps:** folder picker uses Electron dialog via the preload bridge; path is passed verbatim into `team.create { workspace }`.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** open menu, verify recent folders render; stub the dialog (via `invokeBridge` for create) and assert the created team record's `workspace` matches.

### A5. Submit → create team → navigate to team page

- **User flow:** fill name + leader → click "Create Team".
- **Expected outcome:** modal closes, sidebar refreshes, route changes to `/team/<id>`, team page renders with a single leader tab.
- **Backend deps:** `team.create.invoke` → `TeamSessionService.createTeam`; sidebar refresh via `useTeamList.mutate()`; optional `team.listChanged` emitter.
- **E2E coverage:** `team-create.e2e.ts` → `can fill form and create team` and the whitelisted-leader parameterized test.
- **Gap:** test only verifies URL + sidebar text; it does **not** verify the leader tab renders with the leader's badge, nor that `team.get` returns exactly one `lead` agent.

### A6. Provider error surfaces as a user-visible message

- **User flow:** create a team while backend is unavailable.
- **Expected outcome:** `team.create` returns the `{ __bridgeError, message }` sentinel (see `teamBridge.safeProvider`) → `Message.error(result.message)` shows; modal stays open.
- **Backend deps:** `teamBridge.ts#safeProvider`.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** monkey-patch `team.create` to throw; assert an `arco-message-error` element renders and the modal remains visible.

---

## B. Team Sidebar

### B1. List all teams under "Teams"

- **User flow:** observe the sider. In expanded mode each team renders a `SiderItem` with the `Peoples` icon; in collapsed mode each team renders `[data-testid="collapsed-team-item-<teamId>"]` with an icon tooltip.
- **Backend deps:** `team.list.invoke` via `useTeamList`; auto-refresh on `team.listChanged` emitter.
- **E2E coverage:** **PARTIAL** — `team-create.e2e.ts` asserts "E2E Test Team" text appears in the sidebar; there's no test that lists N teams or exercises the collapsed-mode icons.

### B2. Click team → navigate to `/team/<id>`

- **User flow:** click a team in the sider (`onClick={() => handleTeamClick(team.id)}`).
- **Expected outcome:** route changes; TeamPage renders with the leader's tab active.
- **E2E coverage:** `team-create.e2e.ts` indirectly (after create); `team-agent-lifecycle.e2e.ts` uses `navigateTo('#/team/' + id)` but not by clicking the sider item.
- **Suggested assertion:** click `[data-testid="collapsed-team-item-<id>"]` in collapsed mode and assert URL change + tabs rendered.

### B3. Pin / unpin a team

- **User flow:** hover team row → open the three-dot menu → click "Pin" (or "Unpin").
- **Expected outcome:** pinned teams sort above unpinned ones (`sortedTeams` in `TeamSiderSection`). Pin state persists in `localStorage["team-pinned-ids"]`.
- **Backend deps:** **none** — pure client-side.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** create two teams, pin the second → assert its row comes first; reload → assert order survives reload.

### B4. Rename a team from the sider

- **User flow:** hover → menu → "Rename" → type new name in the modal → "Save".
- **Expected outcome:** `ipcBridge.team.renameTeam.invoke({ id, name })`; sidebar refreshes; active TeamPage header updates via SWR key `team/${id}`.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** open rename modal, assert `Save` disabled for empty name, rename → assert new name appears in sider and in the ChatLayout header.

### B5. Delete a team from the sider

- **User flow:** hover → menu → "Delete" → confirm in `Modal.confirm`.
- **Expected outcome:** `team.remove.invoke` → team disappears from sider; if the current route is `/team/<deletedId>`, app navigates to `/`; `localStorage` entries cleaned (`team-active-slot-<id>`, `team-failed-agents[id]`).
- **E2E coverage:** **MISSING** on main. (Note: my working branch has `tests/e2e/cases/teams/team-delete.e2e.ts`, but it has not been merged yet.)
- **Suggested assertion:** create team → navigate into it → delete → assert URL becomes `/` and sider no longer shows the team.

### B6. Sidebar badge for pending permission confirmations

- **User flow:** agent asks for a tool-use confirmation while user is not on the team page.
- **Expected outcome:** red badge with count appears on the team's sider row (expanded & collapsed); ≥100 → "99+".
- **Backend deps:** `useSiderTeamBadges` listens to `conversation.confirmation.add/remove` IPC emitters; fallback to `localStorage["team-pending-permissions-<teamId>"]`.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** inject a `conversation.confirmation.add` event via `invokeBridge`; assert badge DOM element appears with expected count.

---

## C. Team Chat

### C1. User sends a message to the leader

- **User flow:** on the team page, type in the SendBox → press Enter (or click send).
- **Expected outcome:** message renders in the leader's chat column; leader begins streaming a reply; status badge on the leader tab flips to `active`.
- **Backend deps:** `team.sendMessage.invoke({ teamId, content })` → `TeamSession.sendMessage` (when leader tab is active).
- **E2E coverage:** `team-communication.e2e.ts` → `send message to leader via UI input` (happy path only).

### C2. Reasoning / tool-call panel for the leader

- **User flow:** leader's AI pipeline runs; intermediate reasoning or tool calls stream in.
- **Expected outcome:** reasoning blocks render in the chat column; tool calls show a confirmation UI when needed.
- **E2E coverage:** **MISSING** (there is no assertion on reasoning content; the current lifecycle test just polls confirmation buttons).
- **Suggested assertion:** after sending a prompt that triggers a tool use, assert a tool-call block renders and a confirmation overlay appears with `options[0].value` label.

### C3. Empty state for a freshly-created team

- **User flow:** create a team, open it before sending any message.
- **Expected outcome:** `TeamChatEmptyState` renders with the leader's avatar, subtitle ("Describe your goal…") and three suggestion pills (debate / interview / expert_review) that populate the draft.
- **Backend deps:** draft stored via `useSendBoxDraft` (`acp` or `gemini` type).
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** assert suggestion pills are visible; click one → assert the textarea value matches the mapped default string.

### C4. Permission confirmation overlay (team-wide)

- **User flow:** any agent in the team raises a confirmation; any tab the user is viewing shows the global overlay.
- **Expected outcome:** `TeamConfirmOverlay` renders via `createPortal`; keyboard shortcuts — Enter = first option, Y = `proceed_once`, A = `proceed_always`, N/Esc = `cancel`.
- **Backend deps:** `conversation.confirmation.list/add/remove/update/confirm`.
- **E2E coverage:** partially exercised by `team-agent-lifecycle.e2e.ts` (polls and auto-approves), but no assertion on overlay text, keyboard shortcuts, or the "multiple pending" queue.
- **Suggested assertion:** seed two confirmations on two agents → assert overlay shows the first; press `Y` → assert it advances to the second.

---

## D. Team Members

### D1. Leader spawns a member via natural-language chat

- **User flow:** type "Add a claude type member named Foo" in the leader tab → press Enter.
- **Expected outcome:** leader calls the team-MCP `spawn_agent` tool; new tab appears in `[data-testid="team-tab-bar"]`; new agent's conversation is created.
- **Backend deps:** leader runs with MCP tool injection (`TeamMcpServer`); emits `team.agent.spawned`, then `team.agent.status` transitions.
- **E2E coverage:** `team-agent-lifecycle.e2e.ts` — the primary parameterized test (claude / codex / gemini leaders).

### D2. Leader fires a member via natural-language chat

- **User flow:** type "Fire the member named Foo".
- **Expected outcome:** MCP `remove_agent` fires; `team.agent.removed` event → member tab disappears; `useTeamSession` clears the `failed-agent` localStorage entry.
- **E2E coverage:** `team-agent-lifecycle.e2e.ts` covers this in the same parameterized flow.
- **Gap:** only "happy path" is covered; no assertion for the confirmation Modal shown when firing an **active** member (`team.removeAgent.confirmTitle`).

### D3. User manually removes a member from the tab X-icon

- **User flow:** hover a member tab → click the small `CloseSmall` icon.
- **Expected outcome:** if the member's status is `active`, a `Modal.confirm` appears ("Remove Team Member — This member is currently active. Force remove?"); otherwise removes immediately.
- **Backend deps:** `team.removeAgent.invoke`.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** spawn a member → click X → Modal.confirm → OK → assert tab disappears and `team.get` reports fewer agents.

### D4. User renames a member tab (double-click)

- **User flow:** double-click a member tab label → edit inline → Enter.
- **Expected outcome:** `team.renameAgent.invoke({ teamId, slotId, newName })`; `team.agent.renamed` event → tab label updates. Escape reverts.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** double-click tab → type new name → press Enter → assert tab text updates and `team.get` reflects it.

### D5. Leader tab is pinned at index 0 and cannot be removed/reordered

- **Expected outcome:** the `lead` tab shows no `X` icon, is not draggable (`draggable={!isLead}`), and after a drag reorder the leader is forced back to index 0.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** try drag-reorder of two members over the leader → assert leader remains at index 0.

### D6. Member drag-reorder

- **User flow:** drag a member tab onto another member tab.
- **Expected outcome:** order persists in the `TeamTabsContext` local state (note: **not** persisted to backend).
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** drag member B before member A → assert new tab order.

### D7. Failed-member state

- **User flow:** a member's spawn fails (status = `failed`).
- **Expected outcome:** member tab shows failed badge; clicking the tab shows the `AgentChatSlot` failed overlay with a red Close icon and a "Remove" button; status is persisted in `localStorage["team-failed-agents"]` across reloads.
- **E2E coverage:** **MISSING** on main. (My branch has `team-member-init-failure.e2e.ts`.)
- **Suggested assertion:** inject a `team.agent.status { status: 'failed' }` IPC event → assert overlay renders; reload → assert `failed` sticks.

---

## E. Team Mode Switching (permission modes)

### E1. Leader switches permission mode from the agent-mode selector

- **User flow:** in the leader's SendBox, open the `AgentModeSelector` → pick e.g. "Plan" or "Auto".
- **Expected outcome:** mode propagates to **all** member agents; also persisted on the team record so newly spawned agents inherit.
- **Backend deps:** `team.setSessionMode.invoke({ teamId, sessionMode })` (see `TeamPermissionContext.propagateMode`); per-conversation `setMode` IPC in the SendBox.
- **E2E coverage:** **MISSING** on main. (My branch has `team-session-mode.e2e.ts`.)
- **Suggested assertion:** change mode on leader → assert `team.get` returns the matching `sessionMode`; spawn a new member → assert new member inherits the mode.

### E2. Mode persists across reloads

- **Expected outcome:** reload the page → same mode is active in the selector.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** set mode, reload the renderer, re-open the team page, assert the compact label shows the same mode.

---

## F. Team Workspace

### F1. Shared workspace selection at team creation

- See **A4**. Workspace is stored on `TTeam.workspace` and `workspaceMode = 'shared'` (the only mode the UI exposes on main).

### F2. Workspace panel renders in the team page sider

- **User flow:** open a team that has a workspace set.
- **Expected outcome:** the right-hand ChatSider workspace panel auto-expands (via `dispatchWorkspaceHasFilesEvent(true, leadConversationId)`); file tree shows the workspace contents.
- **Backend deps:** `conversation.get` for the lead; `dispatchConversation.extra.workspace` fallback.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** create team with a workspace → assert workspace panel is visible and file tree renders.

### F3. Workspace fallback to lead conversation's temp workspace

- **User flow:** create a team with no workspace → leader still gets a temp workspace from its conversation.
- **Expected outcome:** `effectiveWorkspace = team.workspace || leadConversation.extra.workspace`; the workspace panel still renders if the temp workspace exists.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** create team without workspace → assert `effectiveWorkspace` is non-empty in a runtime probe, and the panel renders.

### F4. Workspace migration (when older teams are opened)

- **Expected outcome:** legacy teams without `workspaceMode` are migrated on load.
- **E2E coverage:** **MISSING** on main. (My branch has `team-workspace-migration.e2e.ts`.)
- **Suggested assertion:** seed a legacy team record directly in SQLite → open → assert `workspaceMode === 'shared'` after `team.get`.

---

## G. Team Communication (inter-agent & user-to-agent)

### G1. User sends a message directly to a specific member tab

- **User flow:** click a member tab → SendBox now routes to that agent → press Enter.
- **Expected outcome:** `team.sendMessageToAgent.invoke({ teamId, slotId, content })` → only that agent responds.
- **E2E coverage:** **MISSING** on main. (My branch has `team-communication.e2e.ts` extended.)
- **Suggested assertion:** switch to member tab → send "ping" → assert message appears in the member's chat column, not the leader's.

### G2. Inter-agent messaging via MCP `send_message` / Mailbox

- **User flow:** the leader instructs a member, whose reply is routed back via the team Mailbox.
- **Expected outcome:** messages flow: leader → member (as a user-style message); member's reply → leader's chat stream as a tool-result-like block.
- **Backend deps:** `TeamMcpServer` + `Mailbox`; emits `team.message` events.
- **E2E coverage:** **MISSING** end-to-end. Unit tests cover `Mailbox` and `TeamMcpServer` in isolation.
- **Suggested assertion:** instruct leader "Ask Foo the result of 1+1 and report it", then assert the leader's final message contains member Foo's answer.

---

## H. Team Tabs

### H1. Active tab persists across reloads

- **User flow:** switch to tab B → reload the app.
- **Expected outcome:** tab B remains active. Key: `localStorage["team-active-slot-<teamId>"]`.
- **E2E coverage:** **MISSING** on main. (My branch has `team-tab-context.e2e.ts`.)
- **Suggested assertion:** switch tabs, reload, assert the previously-active tab is still active.

### H2. Tab auto-switches to leader when active tab is removed

- **User flow:** user is on member tab B → member is fired.
- **Expected outcome:** active tab falls back to the leader (see `TeamTabsProvider.useEffect` for the auto-switch).
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** spawn member, switch to it, then remove it via `team.removeAgent` → assert leader tab becomes active.

### H3. Fullscreen toggle for a single agent

- **User flow:** click the `FullScreen` icon on a tab header → that tab fills the content area; click `OffScreen` to exit.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** click fullscreen on a member tab → assert only that tab is rendered; click off-screen → assert all tabs reappear.

### H4. Horizontal scroll arrows & scroll-snap for many tabs

- **User flow:** spawn >~3 members so tabs overflow → left/right overlays appear.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** spawn enough members that `scrollWidth > clientWidth`; assert the right overlay is visible; click it; assert `scrollLeft` advanced.

### H5. Per-tab pending-confirmation wiggle badge

- **User flow:** a member has pending permission confirmations while user is on a different tab.
- **Expected outcome:** the member tab shows the wiggling `‼️` emoji with a tooltip "<N> pending permission request(s)".
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** inject a `conversation.confirmation.add` event for a specific agent → assert the wiggle emoji appears on that tab's label only.

---

## I. Team Error Handling

### I1. Agent spawn failure → failed overlay + persisted state

- Covered shape described in **D7**.
- **E2E coverage:** **MISSING** on main.

### I2. Team session start failure ("stale URL")

- **User flow:** open a team whose underlying session URL is stale / unreachable.
- **Expected outcome:** `team.ensureSession.invoke` surfaces an error; UI shows a reconnect affordance.
- **E2E coverage:** **MISSING** on main. (My branch has `team-stale-url.e2e.ts`.)
- **Suggested assertion:** simulate a `team.ensureSession` rejection → assert a user-visible error (not a silent freeze).

### I3. `team.create` / `team.*` bridge-level failure (`__bridgeError` sentinel)

- See **A6**.
- **E2E coverage:** **MISSING**.

### I4. Workspace permission / path errors

- **Expected outcome:** if the chosen workspace folder is no longer accessible, the workspace panel renders an error state.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** create team with a path, delete the folder on disk, reopen the team → assert the sider shows an error / empty state instead of crashing.

---

## J. Team Lifecycle (create → use → delete)

### J1. Full end-to-end lifecycle

- **User flow:** create team → send leader a message → spawn member → fire member → delete team.
- **Expected outcome:** no console errors; sider returns to "no teams" (or previous list minus this one); `localStorage` cleanup (`team-active-slot-<id>`, `team-pending-permissions-<id>`, `team-failed-agents[id]`) is performed.
- **E2E coverage:** **MISSING as a single test.** The four existing specs cover fragments, but no spec drives the full cycle and asserts cleanup.
- **Suggested assertion:** after deletion, assert each of the three `localStorage` keys is gone for this team id, and `team.list.invoke` no longer returns it.

### J2. List refresh on `team.listChanged` emitter

- **User flow:** an MCP-driven team creation fires the `team.listChanged` event externally.
- **Expected outcome:** the sider refreshes without user interaction.
- **E2E coverage:** **MISSING**.
- **Suggested assertion:** emit `team.listChanged { action: 'created' }` via `invokeBridge` → assert a new sider row appears.

---

## Summary — coverage at a glance

| Category              | Spec on main                       | Gap severity                                                                                                                               |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Team Creation      | `team-create`, `team-whitelist`    | **High** — whitelist test targets a dropdown that was replaced by a card grid; validation, workspace picker, and provider errors untested. |
| B. Team Sidebar       | `team-create` (partial)            | **High** — pin/unpin, rename, delete, badge all uncovered.                                                                                 |
| C. Team Chat          | `team-communication` (happy path)  | **Medium** — no empty-state, no reasoning, no overlay keyboard shortcut assertions.                                                        |
| D. Team Members       | `team-agent-lifecycle`             | **Medium** — natural-language spawn/fire covered; manual X/rename/drag/failed-state uncovered.                                             |
| E. Mode Switching     | **none**                           | **High** — no coverage on main.                                                                                                            |
| F. Team Workspace     | **none**                           | **High** — no coverage on main.                                                                                                            |
| G. Team Communication | `team-communication` (leader only) | **High** — `sendMessageToAgent` and inter-agent flows uncovered.                                                                           |
| H. Team Tabs          | **none**                           | **High** — persistence, fullscreen, scroll, per-tab badge uncovered.                                                                       |
| I. Error Handling     | **none**                           | **High** — every error path is a blind spot.                                                                                               |
| J. Lifecycle          | **none**                           | **High** — no full-cycle test, no `listChanged` test.                                                                                      |

## Reference — IPC surface the UI depends on

Providers (`ipcBridge.team.*`):
`create`, `list`, `get`, `remove`, `addAgent`, `removeAgent`, `renameAgent`, `renameTeam`, `setSessionMode`, `sendMessage`, `sendMessageToAgent`, `stop`, `ensureSession`.

Emitters (`ipcBridge.team.*`):
`agentStatusChanged`, `agentSpawned`, `agentRemoved`, `agentRenamed`, `listChanged`, `mcpStatus`.

Cross-cutting (`ipcBridge.conversation.*`, used by team code):
`get`, `update`, `confirmation.list`, `confirmation.add`, `confirmation.remove`, `confirmation.update`, `confirmation.confirm`.

Any E2E test that aims to cover a gap above should lock onto the IPC surface it depends on — that is the contract the frontend/backend split must preserve.

# Browser E2E verification for artist-admin UI changes (三号)

When a task changes artist/admin console behavior (e.g. immediate-save upload, layout
fixes), verify end-to-end in a real browser before delivery. This recipe was proven
in v0.34 (cover-upload immediate-save verification).

## 0. Which server runs your code?

The Docker container (`commission-web`) runs the LAST MERGED code, not your branch.
To verify frontend changes against the live DB:

- **Frontend-only change** → run vite dev from the worktree: `cd <worktree>/web; npm run dev`
  (port 5173; vite proxy forwards `/api` + `/uploads` → `http://localhost:3000` container).
  Stop the dev server before delivery.
- **Backend change** → the change must be merged + container rebuilt, or tested via
  `docker exec` scripts; dev-server proxying to the old container tests OLD backend code.

## 1. Dev login (AUTH_DEV_MODE)

Container env decides the login flow — check first:

```powershell
cmd.exe /c "docker exec commission-web printenv AUTH_DEV_MODE NODE_ENV PORT"
```

If `AUTH_DEV_MODE=*** login is self-serve:

1. Navigate to `/login` (artist login page)
2. Enter the artist's QQ (demo artists: alice=10001, bob=10002, carol=10004;
   look up via a temp script: `SELECT id, qq_number, name, subdomain FROM artists WHERE deleted_at IS NULL`)
3. Click 获取登录码 → the page renders an alert "开发模式登录码: NNNNNN"
   (backend also returns `_dev_code` in the send-code API response)
4. Type the code, click 登录. Session cookie persists across navigations.

**🔴 Fast recipe — login via console XHR (skips the flaky UI clicks):**
Artist session = httpOnly cookie (set by POST /api/auth/verify) + localStorage flag
`artist_logged_in=1` (read by router guard). Clicking the UI 登录 button sometimes
doesn't navigate; do it all in one console expression instead:
```js
(()=>{const s=new XMLHttpRequest();s.open('POST','/api/auth/send-code',false);s.setRequestHeader('Content-Type','application/json');s.send(JSON.stringify({qqNumber:'10001'}));const code=JSON.parse(s.responseText)._dev_code;const v=new XMLHttpRequest();v.open('POST','/api/auth/verify',false);v.setRequestHeader('Content-Type','application/json');v.send(JSON.stringify({qqNumber:'10001',code:String(code)}));localStorage.setItem('artist_logged_in','1');return v.status})()
```
Then navigate same-tab: `(()=>{location.href='/orders/802';return 'go'})()`.

**🔴 `browser_navigate` opens a NEW tab → loses localStorage context**: the platform
login lives in localStorage + httpOnly cookie; each fresh tab starts without the
localStorage flag and bounces back to `/login?redirect=...`. Rules: (a) after
`browser_navigate` to any auth-required page, if you land on /login, re-login via the
console recipe above (the httpOnly cookie does NOT persist across these tabs either,
so a full send-code+verify is needed); (b) prefer same-tab `location.href = ...`
navigation for all in-app moves; (c) a verification code is single-use — if you sent
it via the UI and clicked 登录 multiple times, the code is consumed; just send a fresh
one via console.

**🔴 Dev server port may shift**: other roles' worktrees often run their own dev
servers; if 5173/5174 are taken, vite prints `Port 5173 is in use... Local: http://localhost:5175/`.
Read the actual port from the background process output before navigating.

## 2. Injecting a file upload without a real file

`el-upload` with `:http-request` listens on the hidden `input[type=file]` change event.
Generate a PNG on a canvas, wrap in `File` + `DataTransfer`, dispatch change:

```js
new Promise((resolve, reject) => { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 200; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#3498db'; ctx.fillRect(0,0,320,200); canvas.toBlob(blob => { try { const file = new File([blob], 'test.png', { type: 'image/png' }); const dt = new DataTransfer(); dt.items.add(file); const dlg = document.querySelector('.el-dialog'); const input = dlg.querySelector('input[type=file]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); resolve('dispatched'); } catch (e) { reject(e.message) } }, 'image/png'); })
```

Adjust the input selector to context (dialog vs page). Works for single-image uploads;
for multi-file, add more `dt.items.add(...)`.

## 3. browser_console quirks

- **Single-line expressions only.** Multi-line JS in `browser_console` `expression`
  fails with `SyntaxError: Unexpected end of input` (hit twice). Compress to one line —
  no newlines, no comments. Promises work fine when on one line.
- Toasts (`ElMessage`) vanish in ~3s; don't rely on them as evidence. Query the DOM
  (`.el-message`) within 1–2s if needed, but prefer DB/API state.

## 4. Authoritative verification = DB + reload, not the toast

For immediate-save UX fixes, the proof is:

1. After upload injection **without clicking 确定/保存**, read the DB column:
   temp script → `docker cp` into `/app/server/scripts/` → `docker exec -w /app/server commission-web node scripts/_tmp-x.js`
   → confirm the new value landed. (Never leave the temp script behind — `rm` it.)
2. `location.reload()` (or re-navigate), re-open the view, confirm the new value persists.
3. **Restore test data**: UPDATE the column back to its original value, delete the
   uploaded test file from `/app/uploads/...` disk, remove temp scripts. Same
   keepFiles discipline as seed scripts — manual test data is also contamination.

## 5. Gallery aspect-ratio placeholder check (width/height backfill tasks)

The client gallery (`TplGallery.vue`) uses `lazy` el-image: items show skeleton divs
until actually scrolled into view, so an initial full-page screenshot looks empty.
This is NOT a bug. Verification:

1. DOM check (authoritative): `.tpl-gallery-img-wrap` elements carry inline
   `style="aspect-ratio: W / H"` matching the API's width/height — placeholders work
   even before images load.
2. Trigger lazy load: `document.querySelector('.tpl-gallery').scrollIntoView({block:'center'})`,
   wait 2–3s, then count `document.querySelectorAll('.tpl-gallery img')` and check
   `img.complete && naturalWidth > 0`.
3. API ground truth: fetch `/api/artists/<subdomain>` and assert every artwork has
   non-null width/height (via `docker exec` node one-liner or browser fetch).

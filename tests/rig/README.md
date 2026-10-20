# Windows rig specs of this branch

`contacts38.spec.js` is a copy of the spec that runs on the Windows test rig (it lives untracked in
`C:\Users\BT\code\wintest-rig\suite\tests\contacts38.spec.js`; the rig mirrors that repo to C:\EpicRig\rig).
Modern only. Servers: the local stub node (127.0.0.1:13413, nothing is sent) and Epicbox
`epicbox.epicnet.us` (`CONTACTS_EPICBOX` overrides it); never the official epiccash.com servers.

Run: `scripts/test-gate-windows.sh <commit> --specs contacts38` (as epicrig through the rig queue).

# Agent Closure Inspector

The Inspector is a local-first evidence debugger for the frozen
`RISU_AGENT_CLOSURE_V0` verifier.

Run:

```sh
npm run inspector
```

Open the loopback URL printed by the process. Private bundle upload is enabled
only on the literal `127.0.0.1` Inspector origin after the local capability
check succeeds. Uploaded evidence is held in browser and process memory only.
The server does not persist evidence or make external requests. The local JSON
endpoint has a 1 MiB request limit, and the browser checks file size before
reading the selected file.

Canonical public artifacts are generated reproducibly from the eight frozen
fixtures by calling the frozen verifier directly:

```sh
npm run inspector:generate
```

The static files under `inspector/public/` retain canonical exploration when
served without the local evaluation endpoint. Arbitrary bundle evaluation is
available only through the local server.

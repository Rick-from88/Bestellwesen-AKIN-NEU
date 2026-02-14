# Firebase Hosting: Schnell-Deploy-Anleitung

1) Installiere die Firebase CLI (lokal oder verwende npx):

```bash
npm install -g firebase-tools
# oder (kein globales Install): npx firebase-tools@latest <command>
```

2) Projekt-ID eintragen (optional): ersetze `your-firebase-project-id` in `.firebaserc`.

3) Erzeuge ein CI-Token (auf deinem Rechner, nicht hier):

```bash
firebase login:ci
# Kopiere den ausgegebenen Token
```

4) Setze `FIREBASE_TOKEN` als Umgebungsvariable oder GitHub Secret (`FIREBASE_TOKEN`).

5) Deploy-Befehl (lokal):

```bash
# Mit npx (empfohlen):
npx firebase-tools@latest deploy --only hosting --project your-firebase-project-id --token "$FIREBASE_TOKEN"

# Oder mit globaler CLI:
firebase deploy --only hosting --project your-firebase-project-id --token "$FIREBASE_TOKEN"
```

Hinweis: Dieses Repo hostet nur das statische Frontend auf Firebase Hosting. Die API (`/api/...`) bleibt lokal oder muss separat z.B. in Cloud Run deployed und per Rewrite/redirect verbunden werden.

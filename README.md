# Bestellwesen App

## Übersicht
Die Bestellwesen App ist eine moderne Anwendung zur Verwaltung des Bestellwesens innerhalb von Firmen. Sie bietet eine benutzerfreundliche Oberfläche zur Verwaltung von Bestellungen, Lieferanten und Artikeln.

## Funktionen
- **Lieferantenverzeichnis**: Verwalten Sie Ihre Lieferanten mit Filter-, Import- und Exportfunktionen.
- **Artikelverzeichnis**: Organisieren Sie Ihre Artikel mit ähnlichen Funktionen wie das Lieferantenverzeichnis.
- **Bestellübersicht**: Behalten Sie den Überblick über offene und gelieferte Bestellungen.
- **Bestellungen erstellen**: Geben Sie neue Bestellungen ein und lösen Sie diese per E-Mail aus.

## Installation
1. Klonen Sie das Repository:
   ```
   git clone <repository-url>
   ```
2. Navigieren Sie in das Projektverzeichnis:
   ```
   cd bestellwesen-app
   ```
3. Installieren Sie die Abhängigkeiten:
   ```
   npm install
   ```

## Nutzung
Um die Anwendung zu starten, verwenden Sie den folgenden Befehl:
```
npm start
```

## Datenbank (PostgreSQL)
1. Kopieren Sie die Beispiel-Konfiguration:
   ```
   copy .env.example .env
   ```
2. Starten Sie PostgreSQL per Docker:
   ```
   docker compose up -d
   ```
   Beim ersten Start wird das Schema aus [db/schema.sql](db/schema.sql) automatisch angelegt.

## Technologien
- TypeScript
- React
- CSS

## Lizenz
Dieses Projekt ist unter der MIT-Lizenz lizenziert.
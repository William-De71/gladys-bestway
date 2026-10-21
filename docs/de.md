# Bestway Lay-Z-Spa

## Überblick

Diese Integration bringt Bestway-WLAN-Whirlpools (**Lay-Z-Spa**, SaluSpa) und Flowclear-Smart-Touch-Filterpumpen in Gladys, über die Bestway-Cloud, mit dem Konto der App, die Sie schon nutzen.

Gladys liest Wassertemperatur, Soll, Heizung, Filterpumpe, Massage, Düsen und Fehler, kann sie ein- und ausschalten und das Soll ändern. Außerdem lernt sie, wie schnell Ihr Whirlpool heizt, um Ihnen zu sagen, wann das Wasser bereit ist.

Nicht mit Bestway verbunden.

![Die Widgets „Whirlpool“ und „Whirlpool-Kurve“ (generierte Illustration, kein Bildschirmfoto)](https://raw.githubusercontent.com/William-De71/gladys-bestway/main/docs/assets/widgets.de.png)

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer, mit Internetzugang.
- Ein Bestway-WLAN-Whirlpool, der in einer dieser Apps funktioniert, und E-Mail und Passwort dieser App:
  - **Bestway Smart Hub** (Modelle bis etwa 2024, hier V1 genannt);
  - **Bestway Connect** (Modelle ab 2025, hier V2 genannt).
- Konten der App „Lay-Z-Spa Wi-Fi“ werden nicht angenommen: Nutzen Sie eine der beiden Apps oben.

## Konfiguration

### Konten

Tragen Sie das Konto Ihrer App ein:

- **Konto Bestway Smart Hub (V1)**: E-Mail, Passwort und Region (Europa oder USA).
- **Konto Bestway Connect (V2)**: E-Mail, Passwort und Region (Europa, USA oder China). Kein Freigabe-QR-Code nötig.

Sie können beide eintragen, wenn Sie Whirlpools in beiden Apps haben. Lassen Sie das andere leer. Speichern Sie und drücken Sie dann **Konten testen**: Die Integration meldet sich an und listet jeden gefundenen Whirlpool mit Modell und Wassertemperatur auf.

Die Region ist die beim Anlegen des Kontos gewählte: Schlägt die Anmeldung fehl oder wird kein Whirlpool gefunden, versuchen Sie die andere. Nach einer abgelehnten Anmeldung wartet die Integration 15 Minuten bis zum nächsten Versuch (dann länger), damit ein falsches Passwort Ihr Konto nie sperren lässt: Das Speichern des korrigierten Passworts versucht es sofort erneut.

### Einstellungen

**Whirlpools lesen alle**: 30 Sekunden bis 5 Minuten (standardmäßig 1 Minute).

**Sprache der Namen und Texte**: die Sprache der Funktionsnamen, der Massagestufen und der Fehlermeldungen.

## Verwendung

### Geräte

Öffnen Sie den Tab **Entdecken** der Integration und fügen Sie Ihren Whirlpool hinzu. Er bekommt den Namen aus der App und, je nach Modell:

- **Wassertemperatur** und **Solltemperatur** (20 bis 40 °C; ein auf Fahrenheit eingestellter Whirlpool wird umgerechnet);
- **Heizung** (an / aus) und **Heizt gerade**;
- **Strom** und **Filterpumpe**;
- **Massage**: an / aus, oder aus / mittel / maximal bei den V1-Modellen mit Stufen;
- **HydroJet-Düsen** (HydroJet-Modelle) und **Tastensperre** (AirJet-Modelle);
- **Fehler**: die vom Whirlpool gemeldeten Codes (`E02`…), Bedeutung siehe Anleitung.

Eine Flowclear-Smart-Touch-Filterpumpe bekommt Strom, Filter-Timer, Kartusche (OK / wechseln) und Fehler.

Ein Befehl erscheint sofort und bleibt, bis die Cloud ihn meldet (5 bis 30 Sekunden), dann prüft eine Lesung 15 Sekunden später ihn. Die Heizung startet auch die Filterpumpe, wie der Whirlpool selbst.

### Widgets

- **Whirlpool**: Wasser und Soll, die Heizung (aus, heizt, „bereit um 20:30“, Temperatur erreicht), die Filterpumpe, die Massage, die Düsen, die Fehler und Tasten zum Heizen, für die Massage und um das Soll um ein Grad zu ändern.
- **Whirlpool-Kurve**: Wasser- und Solltemperatur über 24 Stunden, 3 oder 7 Tage (das Gerät muss hinzugefügt sein) und die Heizrate des Whirlpools.

Die Uhrzeit „bereit um“ erscheint nach 45 Minuten Heizen: Die Integration misst die Heizrate und merkt sie sich für die nächsten Male.

### Szenen

Auslöser: **Das Wasser erreicht die Solltemperatur**, **Der Whirlpool meldet einen Fehler** (auf Wunsch Filter auf einen Code), **Der Whirlpool ist nicht erreichbar** (5 Minuten), **Der Whirlpool antwortet wieder**.

Aktionen: **Whirlpool auslesen** (Wasser, Soll, Heizung, Minuten bis zum Soll, Uhrzeit, Fehler) und **Whirlpool heizen auf** eine Temperatur (Soll und Heizung in einem Schritt).

Beispiele:

- Jeden Freitag um 17 Uhr → **Whirlpool heizen auf** 38 °C → Nachricht mit der Uhrzeit, zu der er bereit ist.
- Das Wasser erreicht die Solltemperatur → Benachrichtigung „Der Whirlpool ist bereit“.
- Der Whirlpool meldet einen Fehler → Benachrichtigung mit `{{triggerEvent.data.error_code}}`.

## Fehlerbehebung

- **E-Mail oder Passwort wird abgelehnt**: Prüfen Sie, dass Sie das Konto der App nutzen, mit der Ihr Whirlpool funktioniert (Smart Hub = V1, Bestway Connect = V2), und die richtige Region.
- **„Verbunden, aber kein Gerät“**: Der Whirlpool ist nicht in diesem Konto oder dieser Region: Versuchen Sie die andere Region oder fügen Sie den Whirlpool in der App hinzu.
- **Der Whirlpool ist nicht erreichbar**: Prüfen Sie, ob er in der App funktioniert (WLAN des Whirlpools, Strom).
- **Ein Befehl springt kurz auf den alten Wert zurück**: Die Cloud meldet verspätet; der echte Zustand erscheint einige Sekunden später.
- Die Schaltfläche **Konten testen** listet, was die Integration sieht; der Tab Logs der Integration verrät mehr.

Melden Sie ein Problem auf [GitHub](https://github.com/William-De71/gladys-bestway/issues) mit Ihrer Gladys-Version, der Version der Integration, dem Modell des Whirlpools, seiner App (V1 oder V2), der Region und den Logs.

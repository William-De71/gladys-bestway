# Bestway Lay-Z-Spa

## Presentación

Esta integración lleva a Gladys los spas Wi-Fi Bestway (**Lay-Z-Spa**, SaluSpa) y las bombas de filtración Flowclear Smart Touch, a través de la nube de Bestway, con la cuenta de la aplicación que ya usa.

Gladys lee la temperatura del agua, la consigna, la calefacción, la filtración, las burbujas, los chorros y los errores, y puede encenderlos, apagarlos y cambiar la consigna. También aprende lo rápido que calienta su spa, para decirle cuándo estará lista el agua.

Sin relación con Bestway.

![Los widgets «Spa» y «Curva del spa» (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-bestway/main/docs/assets/widgets.es.png)

## Requisitos

- Gladys Assistant 5.3.0 o posterior, con acceso a Internet.
- Un spa Wi-Fi Bestway que funcione en una de estas aplicaciones, y el correo y la contraseña de esa aplicación:
  - **Bestway Smart Hub** (modelos hasta 2024 aproximadamente, llamados V1 aquí);
  - **Bestway Connect** (modelos desde 2025, llamados V2 aquí).
- Las cuentas de la aplicación «Lay-Z-Spa Wi-Fi» no se aceptan: use una de las dos aplicaciones de arriba.

## Configuración

### Cuentas

Indique la cuenta de su aplicación:

- **Cuenta Bestway Smart Hub (V1)**: correo, contraseña y región (Europa o Estados Unidos).
- **Cuenta Bestway Connect (V2)**: correo, contraseña y región (Europa, Estados Unidos o China). No hace falta ningún código QR para compartir.

Puede rellenar las dos si tiene spas en las dos aplicaciones. Deje la otra vacía. Guarde y pulse **Probar las cuentas**: la integración inicia sesión y lista cada spa encontrado, con su modelo y la temperatura del agua.

La región es la elegida al crear la cuenta: si el inicio de sesión falla o no se encuentra ningún spa, pruebe la otra. Tras un inicio de sesión rechazado, la integración espera 15 minutos antes de volver a intentarlo (luego más), para que una contraseña errónea nunca haga bloquear su cuenta: guardar la contraseña corregida lo intenta de nuevo al momento.

### Ajustes

**Leer los spas cada**: de 30 segundos a 5 minutos (1 minuto por defecto).

**Idioma de los nombres y textos**: el idioma de los nombres de las funciones, de los niveles de burbujas y de los mensajes de error.

## Uso

### Dispositivos

Abra la pestaña **Descubrir** de la integración y añada su spa. Recibe el nombre que le dio en la aplicación y, según el modelo:

- **Temperatura del agua** y **Temperatura de consigna** (20 a 40 °C; un spa en Fahrenheit se convierte);
- **Calefacción** (encendida / apagada) y **Calentando ahora**;
- **Encendido** y **Filtración**;
- **Burbujas**: encendidas / apagadas, o apagadas / medio / máximo en los modelos V1 con niveles;
- **Chorros HydroJet** (modelos HydroJet) y **Bloqueo del panel** (modelos AirJet);
- **Errores**: los códigos indicados por el spa (`E02`…), vea su manual para su significado.

Una bomba de filtración Flowclear Smart Touch recibe su encendido, su temporizador de filtración, su cartucho (correcto / cambiar) y sus errores.

Una orden se muestra al momento y se mantiene hasta que la nube la confirma (de 5 a 30 segundos), y una lectura 15 segundos después la comprueba. Encender la calefacción arranca también la filtración, como hace el spa.

### Widgets

- **Spa**: el agua y su consigna, la calefacción (apagada, calentando, «listo a las 20:30», temperatura alcanzada), la filtración, las burbujas, los chorros, los errores, y botones para calentar, para las burbujas y para cambiar la consigna un grado.
- **Curva del spa**: las temperaturas del agua y de consigna en 24 horas, 3 o 7 días (el dispositivo debe estar añadido), y la velocidad de calentamiento del spa.

La hora «listo a las» aparece tras 45 minutos de calentamiento: la integración mide la velocidad de calentamiento y la recuerda para las siguientes veces.

### Escenas

Activadores: **El agua del spa alcanza su consigna**, **El spa indica un error** (filtro por un código si quiere), **El spa es inaccesible** (5 minutos), **El spa responde de nuevo**.

Acciones: **Leer el spa** (agua, consigna, calefacción, minutos hasta la consigna, hora en que estará listo, errores) y **Calentar el spa a** una temperatura (consigna y calefacción en un solo paso).

Ejemplos:

- Cada viernes a las 17 h → **Calentar el spa a** 38 °C → enviar un mensaje con la hora en que estará listo.
- El agua del spa alcanza su consigna → enviar una notificación «El spa está listo».
- El spa indica un error → enviar una notificación con `{{triggerEvent.data.error_code}}`.

## Solución de problemas

- **Se rechaza el correo o la contraseña**: compruebe que usa la cuenta de la aplicación con la que funciona su spa (Smart Hub = V1, Bestway Connect = V2) y la región correcta.
- **«Conectada, pero sin dispositivos»**: el spa no está en esta cuenta o en esta región: pruebe la otra región o añada el spa en la aplicación.
- **El spa es inaccesible**: compruebe que funciona en la aplicación (Wi-Fi del spa, corriente).
- **Una orden vuelve un momento al valor antiguo**: la nube informa con retraso; el estado real aparece unos segundos después.
- El botón **Probar las cuentas** lista lo que ve la integración; la pestaña Logs de la integración da más detalles.

Informe de un problema en [GitHub](https://github.com/William-De71/gladys-bestway/issues) con su versión de Gladys, la versión de la integración, el modelo del spa, su aplicación (V1 o V2), la región y los logs.

// -----------------------------------------------------------------------------
// Runtime texts, in the four languages of the Gladys UI.
//
// `t(key, vars)` returns a multi-language object `{ en, fr, de, es }`
// (configuration button, widgets, toasts, connection status); `text(key,
// language, vars)` returns one string (feature and device names, text
// states, scene action errors: Gladys does not send the language of the user
// with a scan, a command or a scene action, see `language` in config.js).
// `number(value, digits)` formats a number the way each language writes it.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const m = (en, fr, de, es) => ({ en, fr, de, es });

const MESSAGES = {
  // --- Devices ---------------------------------------------------------------------------------
  device_spa: m('Spa', 'Spa', 'Whirlpool', 'Spa'),
  device_pool_filter: m(
    'Pool filter pump',
    'Pompe de filtration',
    'Filterpumpe',
    'Bomba de filtración',
  ),

  // --- Features --------------------------------------------------------------------------------
  feature_temperature: m(
    'Water temperature',
    "Température de l'eau",
    'Wassertemperatur',
    'Temperatura del agua',
  ),
  feature_target: m(
    'Target temperature',
    'Température de consigne',
    'Solltemperatur',
    'Temperatura de consigna',
  ),
  feature_heater: m('Heater', 'Chauffage', 'Heizung', 'Calefacción'),
  feature_heating: m('Heating now', 'Chauffe en cours', 'Heizt gerade', 'Calentando ahora'),
  feature_power: m('Power', 'Alimentation', 'Strom', 'Encendido'),
  feature_filter: m('Filter pump', 'Filtration', 'Filterpumpe', 'Filtración'),
  feature_bubbles: m('Bubbles', 'Bulles', 'Massage', 'Burbujas'),
  feature_bubbles_level: m('Bubbles', 'Bulles', 'Massage', 'Burbujas'),
  feature_jets: m('HydroJet jets', 'Jets HydroJet', 'HydroJet-Düsen', 'Chorros HydroJet'),
  feature_lock: m('Panel lock', 'Verrouillage du panneau', 'Tastensperre', 'Bloqueo del panel'),
  feature_errors: m('Errors', 'Erreurs', 'Fehler', 'Errores'),
  feature_timer: m(
    'Filter timer',
    'Minuterie de filtration',
    'Filter-Timer',
    'Temporizador de filtración',
  ),
  feature_cartridge: m(
    'Filter cartridge',
    'Cartouche filtrante',
    'Filterkartusche',
    'Cartucho filtrante',
  ),

  bubbles_off: m('Off', 'Arrêt', 'Aus', 'Apagadas'),
  bubbles_medium: m('Medium', 'Moyen', 'Mittel', 'Medio'),
  bubbles_max: m('Maximum', 'Maximum', 'Maximum', 'Máximo'),
  cartridge_ok: m('OK', 'OK', 'OK', 'Correcto'),
  cartridge_change: m('To change', 'À changer', 'Wechseln', 'Cambiar'),
  noError: m('None', 'Aucune', 'Keine', 'Ninguno'),

  heater_off: m('Off', 'Arrêt', 'Aus', 'Apagada'),
  heater_on: m('On', 'En marche', 'An', 'Encendida'),
  heater_heating: m('Heating', 'Chauffe', 'Heizt', 'Calentando'),
  heater_target_reached: m(
    'At temperature',
    'Température atteinte',
    'Temperatur erreicht',
    'Temperatura alcanzada',
  ),

  // --- Widgets ---------------------------------------------------------------------------------
  widgetSpa: m('Spa', 'Spa', 'Whirlpool', 'Spa'),
  widgetOffline: m('Unreachable', 'Injoignable', 'Nicht erreichbar', 'Inaccesible'),
  widgetNoSpa: m(
    'No spa yet: fill in your Bestway account in the configuration.',
    'Aucun spa : renseignez votre compte Bestway dans la configuration.',
    'Noch kein Whirlpool: Bestway-Konto in der Konfiguration eintragen.',
    'Aún no hay spa: indique su cuenta Bestway en la configuración.',
  ),
  widgetAddDevice: m(
    'Add the spa in Integrations > Bestway > Discover to see its curves.',
    'Ajoutez le spa (Intégrations > Bestway > Découverte) pour ses courbes.',
    'Whirlpool hinzufügen (Integrationen > Bestway > Entdecken) für die Kurven.',
    'Añada el spa (Integraciones > Bestway > Descubrir) para ver sus curvas.',
  ),
  widgetWater: m('Water', 'Eau', 'Wasser', 'Agua'),
  widgetTarget: m('Target', 'Consigne', 'Soll', 'Consigna'),
  widgetTimer: m('Timer', 'Minuterie', 'Timer', 'Temporizador'),
  widgetHeater: m('Heater', 'Chauffage', 'Heizung', 'Calefacción'),
  widgetReadyAt: m('Ready at {time}', 'Prêt vers {time}', 'Bereit um {time}', 'Listo a las {time}'),
  widgetPower: m('Power', 'Alimentation', 'Strom', 'Encendido'),
  widgetFilter: m('Filter pump', 'Filtration', 'Filterpumpe', 'Filtración'),
  widgetBubbles: m('Bubbles', 'Bulles', 'Massage', 'Burbujas'),
  widgetJets: m('Jets', 'Jets', 'Düsen', 'Chorros'),
  widgetCartridge: m('Cartridge', 'Cartouche', 'Kartusche', 'Cartucho'),
  widgetErrors: m('Errors', 'Erreurs', 'Fehler', 'Errores'),
  widgetOn: m('On', 'En marche', 'An', 'En marcha'),
  widgetOff: m('Off', 'Arrêt', 'Aus', 'Apagado'),
  widgetHeaterOn: m('Heat', 'Chauffer', 'Heizen', 'Calentar'),
  widgetHeaterOff: m('Stop heating', 'Arrêter', 'Heizung aus', 'Dejar de calentar'),
  widgetBubblesOn: m('Bubbles', 'Bulles', 'Massage', 'Burbujas'),
  widgetBubblesOff: m('Stop bubbles', 'Couper les bulles', 'Massage aus', 'Parar burbujas'),
  widgetTargetDown: m('-1 °C', '-1 °C', '-1 °C', '-1 °C'),
  widgetTargetUp: m('+1 °C', '+1 °C', '+1 °C', '+1 °C'),
  widgetTemperatures: m(
    'Water and target',
    'Eau et consigne',
    'Wasser und Soll',
    'Agua y consigna',
  ),
  widgetRate: m('Heating speed', 'Vitesse de chauffe', 'Heizrate', 'Velocidad'),
  widgetRateNote: m(
    'Speed measured on the last heating.',
    'Vitesse mesurée sur la dernière chauffe.',
    'Heizrate der letzten Aufheizung.',
    'Velocidad del último calentamiento.',
  ),
  widgetRateUnknown: m(
    'Speed known after 45 min of heating.',
    'Vitesse connue après 45 min de chauffe.',
    'Heizrate nach 45 Min. Heizen bekannt.',
    'Velocidad conocida tras 45 min.',
  ),

  // --- Toasts ----------------------------------------------------------------------------------
  toastHeaterOn: m(
    'Heater switched on (with the filter pump).',
    'Chauffage allumé (avec la filtration).',
    'Heizung eingeschaltet (mit der Filterpumpe).',
    'Calefacción encendida (con la filtración).',
  ),
  toastHeaterOff: m(
    'Heater switched off.',
    'Chauffage éteint.',
    'Heizung ausgeschaltet.',
    'Calefacción apagada.',
  ),
  toastBubblesOn: m('Bubbles on.', 'Bulles en marche.', 'Massage an.', 'Burbujas en marcha.'),
  toastBubblesOff: m('Bubbles off.', 'Bulles coupées.', 'Massage aus.', 'Burbujas paradas.'),
  toastTarget: m(
    'Target set to {target} °C.',
    'Consigne réglée à {target} °C.',
    'Solltemperatur auf {target} °C gesetzt.',
    'Consigna fijada en {target} °C.',
  ),
  toastFailed: m('Not done:', 'Non effectué :', 'Nicht ausgeführt:', 'No realizado:'),

  // --- Connection status -----------------------------------------------------------------------
  statusNoAccount: m(
    'Fill in the e-mail and password of your Bestway Smart Hub (V1) or Bestway Connect (V2) account.',
    "Renseignez l'e-mail et le mot de passe de votre compte Bestway Smart Hub (V1) ou Bestway Connect (V2).",
    'Tragen Sie E-Mail und Passwort Ihres Kontos Bestway Smart Hub (V1) oder Bestway Connect (V2) ein.',
    'Indique el correo y la contraseña de su cuenta Bestway Smart Hub (V1) o Bestway Connect (V2).',
  ),
  statusConnected: m(
    'Connected to the Bestway cloud: {count} device(s).',
    'Connecté au cloud Bestway : {count} appareil(s).',
    'Mit der Bestway-Cloud verbunden: {count} Gerät(e).',
    'Conectado a la nube de Bestway: {count} dispositivo(s).',
  ),
  statusNoDevice: m(
    'Connected to the Bestway cloud, but the account has no device: add the spa in the Bestway app first.',
    "Connecté au cloud Bestway, mais le compte n'a aucun appareil : ajoutez d'abord le spa dans l'application Bestway.",
    'Mit der Bestway-Cloud verbunden, aber das Konto hat kein Gerät: Fügen Sie den Whirlpool zuerst in der Bestway-App hinzu.',
    'Conectado a la nube de Bestway, pero la cuenta no tiene ningún dispositivo: añada primero el spa en la aplicación Bestway.',
  ),
  statusPartial: m(
    '{count} device(s); the {account} account does not connect (see the test button).',
    '{count} appareil(s) ; le compte {account} ne se connecte pas (voir le bouton de test).',
    '{count} Gerät(e); das Konto {account} verbindet sich nicht (siehe Test-Schaltfläche).',
    '{count} dispositivo(s); la cuenta {account} no se conecta (vea el botón de prueba).',
  ),
  statusCredentials: m(
    'The Bestway cloud refuses the e-mail or password of the {account} account (next try in 15 minutes or more).',
    "Le cloud Bestway refuse l'e-mail ou le mot de passe du compte {account} (nouvel essai dans 15 minutes ou plus).",
    'Die Bestway-Cloud lehnt E-Mail oder Passwort des Kontos {account} ab (neuer Versuch in 15 Minuten oder später).',
    'La nube de Bestway rechaza el correo o la contraseña de la cuenta {account} (nuevo intento en 15 minutos o más).',
  ),
  statusCloudDown: m(
    'The Bestway cloud does not answer for the {account} account.',
    'Le cloud Bestway ne répond pas pour le compte {account}.',
    'Die Bestway-Cloud antwortet nicht für das Konto {account}.',
    'La nube de Bestway no responde para la cuenta {account}.',
  ),

  // --- Errors (commands, scene actions) --------------------------------------------------------
  errorUnknownDevice: m(
    'Unknown device: scan again in Integrations > Bestway.',
    'Appareil inconnu : relancez la découverte dans Intégrations > Bestway.',
    'Unbekanntes Gerät: Suchen Sie erneut unter Integrationen > Bestway.',
    'Dispositivo desconocido: vuelva a buscar en Integraciones > Bestway.',
  ),
  errorReadOnly: m(
    'This value can only be read.',
    'Cette valeur est en lecture seule.',
    'Dieser Wert kann nur gelesen werden.',
    'Este valor solo se puede leer.',
  ),
  errorNotSpa: m(
    'This device is not a spa.',
    "Cet appareil n'est pas un spa.",
    'Dieses Gerät ist kein Whirlpool.',
    'Este dispositivo no es un spa.',
  ),
  errorRange: m(
    'Not possible on this spa: {value} (target from 20 to 40 °C).',
    'Impossible sur ce spa : {value} (consigne de 20 à 40 °C).',
    'Bei diesem Whirlpool nicht möglich: {value} (Soll 20 bis 40 °C).',
    'No es posible en este spa: {value} (consigna de 20 a 40 °C).',
  ),
  errorCredentials: m(
    'The Bestway cloud refuses the {account} account: check the e-mail and password.',
    "Le cloud Bestway refuse le compte {account} : vérifiez l'e-mail et le mot de passe.",
    'Die Bestway-Cloud lehnt das Konto {account} ab: Prüfen Sie E-Mail und Passwort.',
    'La nube de Bestway rechaza la cuenta {account}: compruebe el correo y la contraseña.',
  ),
  errorUnreachable: m(
    '{name} cannot be reached through the Bestway cloud ({error}).',
    '{name} est injoignable par le cloud Bestway ({error}).',
    '{name} ist über die Bestway-Cloud nicht erreichbar ({error}).',
    '{name} no es accesible a través de la nube de Bestway ({error}).',
  ),

  // --- Test button -----------------------------------------------------------------------------
  accountV1: m(
    'Bestway Smart Hub account (V1)',
    'Compte Bestway Smart Hub (V1)',
    'Konto Bestway Smart Hub (V1)',
    'Cuenta Bestway Smart Hub (V1)',
  ),
  accountV2: m(
    'Bestway Connect account (V2)',
    'Compte Bestway Connect (V2)',
    'Konto Bestway Connect (V2)',
    'Cuenta Bestway Connect (V2)',
  ),
  testNoAccount: m(
    'No account yet: fill in an e-mail and a password above, then save.',
    "Aucun compte pour l'instant : renseignez un e-mail et un mot de passe ci-dessus, puis enregistrez.",
    'Noch kein Konto: Tragen Sie oben E-Mail und Passwort ein und speichern Sie.',
    'Aún no hay cuenta: indique arriba un correo y una contraseña y guarde.',
  ),
  testAccountOk: m(
    '{account}: connected, {count} device(s): {list}.',
    '{account} : connecté, {count} appareil(s) : {list}.',
    '{account}: verbunden, {count} Gerät(e): {list}.',
    '{account}: conectada, {count} dispositivo(s): {list}.',
  ),
  testAccountEmpty: m(
    '{account}: connected, but no device on this account (add the spa in the app, or try the other region).',
    "{account} : connecté, mais aucun appareil sur ce compte (ajoutez le spa dans l'application, ou essayez l'autre région).",
    '{account}: verbunden, aber kein Gerät in diesem Konto (Whirlpool in der App hinzufügen oder die andere Region versuchen).',
    '{account}: conectada, pero sin dispositivos (añada el spa en la aplicación o pruebe la otra región).',
  ),
  testCredentials: m(
    '{account}: e-mail or password refused ({error}). Check them, and the region: the next try waits 15 minutes.',
    '{account} : e-mail ou mot de passe refusé ({error}). Vérifiez-les, ainsi que la région : le prochain essai attend 15 minutes.',
    '{account}: E-Mail oder Passwort abgelehnt ({error}). Prüfen Sie sie und die Region: Der nächste Versuch wartet 15 Minuten.',
    '{account}: correo o contraseña rechazados ({error}). Compruébelos, y la región: el próximo intento espera 15 minutos.',
  ),
  testWaiting: m(
    '{account}: refused a moment ago, the next login waits a little ({error}) so the account is not locked.',
    '{account} : refusé il y a peu, la prochaine connexion attend un peu ({error}) pour ne pas bloquer le compte.',
    '{account}: vor Kurzem abgelehnt, die nächste Anmeldung wartet etwas ({error}), damit das Konto nicht gesperrt wird.',
    '{account}: rechazada hace poco, el próximo inicio de sesión espera un poco ({error}) para no bloquear la cuenta.',
  ),
  testCloudDown: m(
    '{account}: the Bestway cloud does not answer ({error}).',
    '{account} : le cloud Bestway ne répond pas ({error}).',
    '{account}: Die Bestway-Cloud antwortet nicht ({error}).',
    '{account}: la nube de Bestway no responde ({error}).',
  ),
  testOnline: m('online', 'en ligne', 'online', 'en línea'),
  testOffline: m('offline', 'hors ligne', 'offline', 'sin conexión'),
};

/**
 * @description A number written the way each language writes it.
 * @param {number} value - The number.
 * @param {number} digits - Decimals.
 * @param {string} [unit] - Appended after a non-breaking space.
 * @returns {{en: string, fr: string, de: string, es: string}} The texts.
 */
export function number(value, digits, unit = '') {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const formatted = new Intl.NumberFormat(LOCALES[language], {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        // Spanish skips the separator below 10 000: keep it everywhere.
        useGrouping: 'always',
      }).format(value);
      return [language, unit ? `${formatted}\u00a0${unit}` : formatted];
    }),
  );
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * @description A runtime text in the four languages.
 * @param {string} key - Message key.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function t(key, vars = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, text(key, language, vars)]));
}

/**
 * @description A runtime text in one language (English when unknown).
 * @param {string} key - Message key.
 * @param {string} language - Language code.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {string} The text.
 */
export function text(key, language, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message ${key}`);
  }
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const resolved = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, pick(value, lang)]),
  );
  return fill(message[lang], resolved);
}

/**
 * @description One language of a value that may be multi-language.
 * @param {*} value - A string, a number or `{ en, fr, ... }`.
 * @param {string} language - Language code.
 * @returns {*} The value in that language.
 */
export function pick(value, language) {
  if (value && typeof value === 'object') {
    return value[language] ?? value.en;
  }
  return value;
}

/**
 * @description Cut a text to a maximum length, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - Maximum length.
 * @returns {string} The text, at most `max` characters.
 */
export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length <= max ? string : `${string.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @description Cut every language of a multi-language text.
 * @param {object} message - `{ en, fr, ... }`.
 * @param {number} max - Maximum length.
 * @returns {object} The message.
 */
export function truncateAll(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, value]) => [language, truncate(value, max)]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const MESSAGES_FOR_TESTS = MESSAGES;

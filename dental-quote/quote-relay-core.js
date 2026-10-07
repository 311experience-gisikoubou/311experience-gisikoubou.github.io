(function (root) {
  'use strict';

  const SESSION_KEY = 'denture_quote_current_meta_v1';
  const PRICE_VERSION = 'koyoshi-standard-2026-09-12-v1';
  const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const TTL_DAYS = 30;
  const ITEM_KEYS = Object.freeze([
    'posteriorRetention', 'softResin', 'thermoDouble', 'restCount', 'metalupCount',
    'castClasp', 'wireClasp', 'twinClasp', 'wireTwinClasp', 'roachIBar',
    'pgaWireClasp', 'roachTBar', 'pgaWireTwinClasp', 'combinationClasp',
    'reinforcementPlate', 'ringClasp', 'restHook', 'backActionClasp', 'hairpinClasp'
  ]);
  const RELAY_FIELDS = Object.freeze([
    'clinicName', 'caseNumber', 'quoteRef', 'version', 'dentureType', 'jaws',
    'missingTeeth', 'twoDentures', 'selectedItems', 'subtotal', 'tax', 'total',
    'priceVersion', 'createdAt', 'expiresAt', 'status', 'creatorUid'
  ]);

  function ymd(date) {
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  function randomSuffix(cryptoObj, length = 6) {
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
      throw new Error('secure random generator unavailable');
    }
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  }

  function generateQuoteRef(date = new Date(), cryptoObj = root.crypto) {
    return `Q-${ymd(date)}-${randomSuffix(cryptoObj)}`;
  }

  function createQuoteMeta(date = new Date(), cryptoObj = root.crypto) {
    return {
      quoteRef: generateQuoteRef(date, cryptoObj),
      version: 1,
      priceVersion: PRICE_VERSION
    };
  }

  function isValidMeta(meta) {
    return Boolean(
      meta &&
      /^Q-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(meta.quoteRef) &&
      Number.isInteger(meta.version) && meta.version > 0 &&
      meta.priceVersion === PRICE_VERSION
    );
  }

  function loadOrCreateQuoteMeta(storage, date = new Date(), cryptoObj = root.crypto) {
    const raw = storage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isValidMeta(parsed)) return parsed;
      } catch (_) {}
    }
    const created = createQuoteMeta(date, cryptoObj);
    storage.setItem(SESSION_KEY, JSON.stringify(created));
    return created;
  }

  function saveQuoteMeta(storage, meta) {
    if (!isValidMeta(meta)) throw new Error('invalid quote metadata');
    storage.setItem(SESSION_KEY, JSON.stringify(meta));
    return meta;
  }

  function nextVersion(storage, meta) {
    return saveQuoteMeta(storage, { ...meta, version: meta.version + 1 });
  }

  function clearCurrentQuoteMeta(storage) {
    storage.removeItem(SESSION_KEY);
  }

  function finiteNumber(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`invalid ${name}`);
    return n;
  }

  function cleanString(value, name, maxLength) {
    const text = String(value ?? '').trim();
    if (!text || text.length > maxLength) throw new Error(`invalid ${name}`);
    return text;
  }

  function optionalString(value, maxLength) {
    const text = String(value ?? '').trim();
    if (text.length > maxLength) throw new Error('string too long');
    return text;
  }

  function sanitizeTeeth(input = {}) {
    const cleanIndexes = (value) => Array.from(new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 15)
    )).sort((a, b) => a - b);
    return {
      jaws: { upper: input.jaws?.upper === true, lower: input.jaws?.lower === true },
      missingTeeth: {
        upper: cleanIndexes(input.missingTeeth?.upper),
        lower: cleanIndexes(input.missingTeeth?.lower)
      },
      twoDentures: {
        upper: input.twoDentures?.upper === true,
        lower: input.twoDentures?.lower === true
      }
    };
  }

  function sanitizeSelectedItems(items = {}) {
    if (!items || typeof items !== 'object' || Array.isArray(items)) {
      throw new Error('invalid selectedItems');
    }
    const unknown = Object.keys(items).filter((key) => !ITEM_KEYS.includes(key));
    if (unknown.length) throw new Error('unknown selected item');
    const out = {};
    for (const key of ITEM_KEYS) {
      const value = finiteNumber(items[key] ?? 0, key);
      if (!Number.isInteger(value) || value > 99) throw new Error(`invalid ${key}`);
      out[key] = value;
    }
    return out;
  }

  function buildRelayPayload(input, meta, creatorUid, now = new Date()) {
    if (!isValidMeta(meta)) throw new Error('invalid quote metadata');
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid date');
    const teeth = sanitizeTeeth(input);
    return {
      clinicName: cleanString(input.clinicName, 'clinicName', 80),
      caseNumber: optionalString(input.caseNumber, 80),
      quoteRef: meta.quoteRef,
      version: meta.version,
      dentureType: cleanString(input.dentureType, 'dentureType', 40),
      jaws: teeth.jaws,
      missingTeeth: teeth.missingTeeth,
      twoDentures: teeth.twoDentures,
      selectedItems: sanitizeSelectedItems(input.selectedItems || {}),
      subtotal: finiteNumber(input.subtotal, 'subtotal'),
      tax: finiteNumber(input.tax, 'tax'),
      total: finiteNumber(input.total, 'total'),
      priceVersion: meta.priceVersion,
      createdAt: new Date(now.getTime()),
      expiresAt: new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000),
      status: 'submitted',
      creatorUid: cleanString(creatorUid, 'creatorUid', 128)
    };
  }

  const api = Object.freeze({
    SESSION_KEY,
    PRICE_VERSION,
    TTL_DAYS,
    ITEM_KEYS,
    RELAY_FIELDS,
    createQuoteMeta,
    generateQuoteRef,
    loadOrCreateQuoteMeta,
    saveQuoteMeta,
    nextVersion,
    clearCurrentQuoteMeta,
    buildRelayPayload
  });

  root.QuoteRelayCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  'use strict';

  function relayDocumentId(meta) {
    if (!meta || !/^Q-\d{8}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(meta.quoteRef)) {
      throw new Error('invalid quoteRef');
    }
    if (!Number.isInteger(meta.version) || meta.version < 1 || meta.version > 999) {
      throw new Error('invalid version');
    }
    return `${meta.quoteRef}-v${meta.version}`;
  }

  function createRelayTransport(deps) {
    const {
      auth, db, signInAnonymously, doc, setDoc, getDoc,
      buildRelayPayload, now = () => new Date()
    } = deps || {};
    if (!auth || !db || !signInAnonymously || !doc || !setDoc || !getDoc || !buildRelayPayload) {
      throw new Error('relay transport dependencies missing');
    }

    async function ensureAnonymousUser() {
      if (auth.currentUser) return auth.currentUser;
      const credential = await signInAnonymously(auth);
      if (!credential || !credential.user || !credential.user.uid) {
        throw new Error('anonymous sign-in failed');
      }
      return credential.user;
    }

    function ownedMeta(data, user, meta) {
      return Boolean(
        data &&
        data.creatorUid === user.uid &&
        data.quoteRef === meta.quoteRef &&
        data.version === meta.version
      );
    }

    function normalize(value) {
      if (value instanceof Date) return value.toISOString();
      if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
      }
      return value;
    }

    async function verifyExisting(ref, expected) {
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) return false;
      const data = snapshot.data();
      return JSON.stringify(normalize(data)) === JSON.stringify(normalize(expected));
    }

    async function send(input, meta) {
      const user = await ensureAnonymousUser();
      const payload = buildRelayPayload(input, meta, user.uid, now());
      const relayId = relayDocumentId(meta);
      const ref = doc(db, 'quoteRelay', relayId);
      try {
        await setDoc(ref, payload);
        return { relayId, payload, verified: true, recovered: false };
      } catch (error) {
        try {
          if (await verifyExisting(ref, payload)) {
            return { relayId, payload, verified: true, recovered: true };
          }
        } catch (_) {}
        throw error;
      }
    }

    async function readStatus(meta) {
      const user = await ensureAnonymousUser();
      const relayId = relayDocumentId(meta);
      const ackRef = doc(db, 'quoteAck', user.uid, 'items', relayId);
      const ackSnapshot = await getDoc(ackRef);
      if (!ackSnapshot.exists()) {
        return { relayId, exists: false, status: null, source: null };
      }
      const ack = ackSnapshot.data();
      if (!ownedMeta(ack, user, meta) || ack.status !== 'confirmed') {
        throw new Error('ack ownership mismatch');
      }
      return { relayId, exists: true, status: 'confirmed', source: 'ack', confirmedAt: ack.confirmedAt || null };
    }

    return Object.freeze({ send, readStatus });
  }

  const api = Object.freeze({ relayDocumentId, createRelayTransport });
  root.QuoteRelayTransport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

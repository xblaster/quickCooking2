// Faux authentificateur WebAuthn pour les tests : produit des réponses de création et de connexion
// au format envoyé par l'interface (base64url, clé publique en SPKI), signées par une vraie clé.
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const sha = (x) => createHash("sha256").update(x).digest();
const b64 = (b) => Buffer.from(b).toString("base64url");

export function fauxAuthentificateur({ rpId = "localhost", origine = "http://localhost:3000", alg = -7 } = {}) {
  const { publicKey, privateKey } =
    alg === -8 ? generateKeyPairSync("ed25519")
    : alg === -257 ? generateKeyPairSync("rsa", { modulusLength: 2048 })
    : generateKeyPairSync("ec", { namedCurve: "P-256" });
  const id = randomBytes(16);

  function authData({ drapeaux = 0x05, attestee = false, rp = rpId, compteur = 0 }) {
    const tete = Buffer.alloc(37);
    sha(rp).copy(tete);
    tete[32] = drapeaux | (attestee ? 0x40 : 0);
    tete.writeUInt32BE(compteur, 33);
    if (!attestee) return tete;
    const long = Buffer.alloc(2);
    long.writeUInt16BE(id.length);
    return Buffer.concat([tete, Buffer.alloc(16), long, id]);
  }
  const clientData = (type, challenge, o) => Buffer.from(JSON.stringify({ type, challenge, origin: o ?? origine, crossOrigin: false }));

  return {
    id: b64(id),
    /** Réponse à navigator.credentials.create ; `o` permet de fausser rp, origine, drapeaux. */
    creer(challenge, o = {}) {
      return {
        id: b64(id),
        clientDataJSON: b64(clientData(o.type ?? "webauthn.create", challenge, o.origine)),
        authenticatorData: b64(authData({ ...o, attestee: true })),
        publicKey: b64(publicKey.export({ type: "spki", format: "der" })),
        publicKeyAlgorithm: alg,
      };
    },
    /** Réponse à navigator.credentials.get. */
    signer(challenge, o = {}) {
      const ad = authData(o);
      const cd = clientData(o.type ?? "webauthn.get", challenge, o.origine);
      const donnees = Buffer.concat([ad, sha(cd)]);
      let signature = alg === -8 ? sign(null, donnees, privateKey) : sign("sha256", donnees, privateKey);
      if (o.altere) signature = Buffer.from(signature.map((x, i) => (i === 10 ? x ^ 0xff : x)));
      return { id: b64(id), clientDataJSON: b64(cd), authenticatorData: b64(ad), signature: b64(signature) };
    },
  };
}

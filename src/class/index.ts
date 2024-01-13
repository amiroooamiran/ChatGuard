import forge from "node-forge";
import Cipher from "src/utils/Cipher";
import { chromeStorage } from "src/store";
import { LocalStorage } from "src/utils/Storage";
import { selectors } from "src/constant/selectors";

interface Url {
  path: string;
  params: Record<string, string>;
}
interface State {
  value: string;
  encrypted: string;
  [key: string]: any;
}
class ChatGuard {
  ENCRYPT_PREFIX = `::MESSAGE::`;
  HANDSHAKE_PREFIX = `::HANDSHAKE::`;
  ACKNOWLEDGMENT_PREFIX = `::ACKNOWLEDGMENT::`;

  url: Url = { path: "", params: {} };
  selector = selectors[window.location.hostname];
  cipher = new Cipher();
  storage = new LocalStorage();
  state: State = { encrypted: "", value: "" };

  constructor(private readonly user: { id: string }) {}

  public async register() {
    let store = await chromeStorage.get();
    if (!store || !store.enable) return;

    if (!store.user) {
      await new Promise<void>((res) => {
        forge.pki.rsa.generateKeyPair({}, (error, keyPair) => {
          if (error) return alert("Error in chatGuard generating key pair");
          const publicKey = forge.pki.publicKeyToPem(keyPair.publicKey);
          const privateKey = forge.pki.privateKeyToPem(keyPair.privateKey);
          this.storage.setMap("chatguard_contacts", this.user.id, {
            publicKey,
            timestamp: new Date().getTime(),
            enable: true,
            acknowledged: true,
          });
          chromeStorage.set({
            ...store,
            user: {
              id: `${this.user.id}`,
              publicKey,
              privateKey,
            },
          });
          res();
        });
      });
    }
    store = await chromeStorage.get();
  }
  public async createDRSAP(message: string, to: string) {
    let store = await chromeStorage.get();
    const secretKey = this.cipher.generateKey();
    const ownPublicKey = forge.pki.publicKeyFromPem(store.user!.publicKey);
    const { publicKey: publicKeyPem } = this.storage.getMap("chatguard_contacts", to);
    if (!publicKeyPem) return null;
    const toPublicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const r1 = forge.util.bytesToHex(ownPublicKey.encrypt(secretKey));
    const r2 = forge.util.bytesToHex(toPublicKey.encrypt(secretKey));
    const encryptedMessage = await this.cipher.encrypt(message, secretKey);
    const template = `${this.ENCRYPT_PREFIX}__${r1}__${r2}__${encryptedMessage}`;
    return template;
  }
  public async resolveDRSAP(packet: string) {
    let store = await chromeStorage.get();
    const [_, r1, r2, encryptedMessage] = packet.split("__");
    const ownPrivateKey = forge.pki.privateKeyFromPem(store.user!.privateKey);
    let key;
    try {
      key = ownPrivateKey.decrypt(forge.util.hexToBytes(r1));
    } catch (error) {}
    if (!key) {
      try {
        key = ownPrivateKey.decrypt(forge.util.hexToBytes(r2));
      } catch (error) {}
    }
    if (!key) return null;
    const message = this.cipher.decrypt(encryptedMessage, key as string);
    return message;
  }

  public async createDRSAPHandshake() {
    const store = await chromeStorage.get();
    const packet = `${this.HANDSHAKE_PREFIX}__${new Date().getTime()}__${store.user?.id}__${store.user!.publicKey}`;
    return packet;
  }
  public async resolveDRSAPHandshake(packet: string) {
    let store = await chromeStorage.get();
    const [_prefix, timestamp, id, publicKey] = packet.split("__");
    if (id === store.user!.id.toString()) return;
    console.log({ publicKey });
    const { timestamp: oldTimestamp } = this.storage.getMap("chatguard_contacts", id);
    if (+timestamp < +oldTimestamp) return;
    this.storage.setMap("chatguard_contacts", id, {
      publicKey,
      timestamp: new Date().getTime(),
      acknowledged: false,
      enable: true,
    });
    return this.createDRSAPAcknowledgment(id);
  }
  public createDRSAPAcknowledgment(id: string) {
    return `${this.ACKNOWLEDGMENT_PREFIX}__${id}`;
  }
  public resolveDRSAPAcknowledgment(packet: string) {
    const [_, id] = packet.split("__");
    const user = this.storage.getMap("chatguard_contacts", id);
    if (!user.publicKey) return;
    user.acknowledged = true;
  }

  public urlObserver() {
    if (this.url.path === window.location.href) return;
    this.url.path = window.location.href;
    this.state = { value: "", encrypted: "" };
    const params = new URLSearchParams(window.location.search);
    params.forEach((val, key) => {
      this.url.params[key] = val;
    });
    this.storage.set("chatguard_current-route", this.url.path);
  }
}

export default ChatGuard;

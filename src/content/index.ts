import ChatGuard from "src/class";
import { LocalStorage } from "src/utils/Storage";

(async function init() {
  console.log("new version 1");
  const storage = new LocalStorage();
  const app = new ChatGuard(storage.get("user"));

  const mainApp = (await app.dom.getElement(app.selector.app)) as HTMLElement;
  const chatWrapper = mainApp.children[2] as HTMLElement;

  await app.register();
  await app.exchangeService.connectToPeerServer(peerConfig.url);
  await app.initDomManipulation(chatWrapper);
})();
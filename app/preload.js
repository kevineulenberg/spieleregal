const { contextBridge, ipcRenderer, webUtils } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('api', {
  state: call('state'),
  launch: call('launch'),
  pickGames: call('pickGames'),
  addPaths: call('addPaths'),
  update: call('update'),
  remove: call('remove'),
  pickImage: call('pickImage'),
  pickTarget: call('pickTarget'),
  setImage: call('setImage'),
  searchCovers: call('searchCovers'),
  fetchMissing: call('fetchMissing'),
  setSettings: call('setSettings'),
  reveal: call('reveal'),
  showMain: call('showMain'),
  installWidget: call('installWidget'),
  hideWidget: call('hideWidget'),
  openExternal: call('openExternal'),
  pathFor: (file) => webUtils.getPathForFile(file),
  on: (ch, fn) => ipcRenderer.on(ch, (_e, ...a) => fn(...a)),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fileManager', {
  isElectron: true,
  getQuickAccess: () => ipcRenderer.invoke('fs:getQuickAccess'),
  getHomePath: () => ipcRenderer.invoke('fs:getHomePath'),
  readDirectory: (dirPath) => ipcRenderer.invoke('fs:readDirectory', dirPath),
  selectDirectory: (title) => ipcRenderer.invoke('fs:selectDirectory', title),
  selectFiles: (title) => ipcRenderer.invoke('fs:selectFiles', title),
  createFolder: (parentPath, name) => ipcRenderer.invoke('fs:createFolder', parentPath, name),
  createFile: (parentPath, name) => ipcRenderer.invoke('fs:createFile', parentPath, name),
  rename: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  delete: (paths) => ipcRenderer.invoke('fs:delete', paths),
  move: (sourcePaths, destDir) => ipcRenderer.invoke('fs:move', sourcePaths, destDir),
  copy: (sourcePaths, destDir) => ipcRenderer.invoke('fs:copy', sourcePaths, destDir),
  duplicate: (sourcePaths) => ipcRenderer.invoke('fs:duplicate', sourcePaths),
  importFiles: (destDir, sourcePaths) => ipcRenderer.invoke('fs:importFiles', destDir, sourcePaths),
  readTextFile: (filePath) => ipcRenderer.invoke('fs:readTextFile', filePath),
  readImageFile: (filePath) => ipcRenderer.invoke('fs:readImageFile', filePath),
  openPath: (targetPath, options) => ipcRenderer.invoke('fs:openPath', targetPath, options),
  onDownloadProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('fs:downloadProgress', listener);
    return () => ipcRenderer.removeListener('fs:downloadProgress', listener);
  },
  getRemoteCacheDir: () => ipcRenderer.invoke('fs:getRemoteCacheDir'),
  pickRemoteDownloadDir: () => ipcRenderer.invoke('fs:pickRemoteDownloadDir'),
  showInFolder: (targetPath) => ipcRenderer.invoke('fs:showInFolder', targetPath),
  openInTerminal: (targetPath) => ipcRenderer.invoke('fs:openInTerminal', targetPath),
  getParentPath: (targetPath) => ipcRenderer.invoke('fs:getParentPath', targetPath),
  writeClipboard: (text) => ipcRenderer.invoke('fs:writeClipboard', text),
  getEntriesInfo: (paths) => ipcRenderer.invoke('fs:getEntriesInfo', paths),
  cancelDownload: (downloadId) => ipcRenderer.invoke('fs:cancelDownload', downloadId),
  remoteConnect: (config) => ipcRenderer.invoke('remote:connect', config),
  remoteDisconnect: (connId) => ipcRenderer.invoke('remote:disconnect', connId),
  remoteGetConnections: () => ipcRenderer.invoke('remote:getConnections'),
  remoteDeleteConnection: (connId) => ipcRenderer.invoke('remote:deleteConnection', connId),
  remoteGetSavedPassword: (connId) => ipcRenderer.invoke('remote:getSavedPassword', connId),
  remoteGetActive: () => ipcRenderer.invoke('remote:getActive'),
  remoteSetEncoding: (connId, encoding) => ipcRenderer.invoke('remote:setEncoding', connId, encoding),
  remoteGetEncodings: () => ipcRenderer.invoke('remote:getEncodings'),
});

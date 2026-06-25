import { ref } from 'vue';

function getApi() {
  return window.fileManager;
}

export const FTP_ENCODING_OPTIONS = [
  { value: 'gbk', label: 'GBK（简体中文 Windows）' },
  { value: 'gb18030', label: 'GB18030' },
  { value: 'utf8', label: 'UTF-8' },
  { value: 'big5', label: 'Big5（繁体中文）' },
  { value: 'latin1', label: 'Latin-1' },
];

export function useRemoteConnections() {
  const connections = ref([]);
  const loading = ref(false);

  async function refresh() {
    const api = getApi();
    connections.value = await api.remoteGetConnections();
  }

  async function connect(config) {
    loading.value = true;
    try {
      const result = await getApi().remoteConnect(config);
      if (!result?.ok) throw new Error(result?.error || '连接失败');
      await refresh();
      return result.data;
    } finally {
      loading.value = false;
    }
  }

  async function disconnect(connId) {
    await getApi().remoteDisconnect(connId);
    await refresh();
  }

  async function removeConnection(connId) {
    await getApi().remoteDeleteConnection(connId);
    await refresh();
  }

  function getConnectionLabel(connId) {
    return connections.value.find((item) => item.id === connId)?.name || connId.slice(0, 8);
  }

  async function setEncoding(connId, encoding) {
    await getApi().remoteSetEncoding(connId, encoding);
    await refresh();
  }

  return {
    connections,
    loading,
    refresh,
    connect,
    disconnect,
    removeConnection,
    getConnectionLabel,
    setEncoding,
  };
}

export function isRemotePath(targetPath) {
  return typeof targetPath === 'string' && targetPath.startsWith('remote://');
}

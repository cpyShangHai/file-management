export function buildEntryContextMenu({
  entry,
  selectedCount,
  hasClipboard,
  isText,
  isImage,
  isRemote = false,
}) {
  const multi = selectedCount > 1;
  const items = [
    {
      id: 'open',
      label: entry.isDirectory ? '打开' : '打开',
      shortcut: 'Enter',
    },
  ];

  if (!entry.isDirectory && (isText || isImage)) {
    items.push({ id: 'preview', label: isImage ? '预览图片' : '预览' });
  }

  items.push(
    { id: 'sep-open', type: 'separator' },
    { id: 'cut', label: '剪切', shortcut: '⌘X', disabled: false },
    { id: 'copy', label: '复制', shortcut: '⌘C' },
    { id: 'duplicate', label: '创建副本', disabled: multi },
    {
      id: 'paste',
      label: entry.isDirectory ? '粘贴到此处' : '粘贴',
      shortcut: '⌘V',
      disabled: !hasClipboard || (!entry.isDirectory && multi),
    },
    { id: 'sep-edit', type: 'separator' },
    { id: 'rename', label: '重命名', shortcut: 'F2', disabled: multi },
    { id: 'delete', label: multi ? `删除 ${selectedCount} 项` : '删除', shortcut: '⌘⌫', danger: true },
    { id: 'sep-move', type: 'separator' },
    { id: 'moveTo', label: '移动到…', shortcut: '⌘⇧M' },
    { id: 'copyTo', label: '复制到…', shortcut: '⌘⇧D' },
    { id: 'sep-export', type: 'separator' },
    { id: 'exportDesktop', label: '导出到桌面' },
  );

  if (isRemote) {
    items.push({ id: 'exportLocal', label: '导出到其它文件夹…' });
  }

  items.push(
    { id: 'sep-info', type: 'separator' },
    { id: 'copyPath', label: '复制路径', shortcut: '⌘⌥C' },
    { id: 'copyName', label: '复制名称' },
  );

  if (!isRemote) {
    items.push(
      { id: 'reveal', label: '在 Finder 中显示', shortcut: '⌘R' },
      { id: 'terminal', label: '在终端中打开', shortcut: '⌘⇧T', disabled: multi },
    );
  }

  return items;
}

export function buildBlankContextMenu({ hasClipboard, isRemote = false }) {
  const items = [
    { id: 'paste', label: '粘贴', shortcut: '⌘V', disabled: !hasClipboard },
    { id: 'sep1', type: 'separator' },
    { id: 'newFolder', label: '新建文件夹', shortcut: '⌘⇧N' },
    { id: 'newFile', label: '新建文件', shortcut: '⌘N' },
  ];

  if (!isRemote) {
    items.push({ id: 'import', label: '导入文件…' });
  }

  items.push(
    { id: 'sep2', type: 'separator' },
    { id: 'selectAll', label: '全选', shortcut: '⌘A' },
    { id: 'refresh', label: '刷新', shortcut: '⌘R' },
  );

  if (!isRemote) {
    items.push(
      { id: 'sep3', type: 'separator' },
      { id: 'terminal', label: '在终端中打开', shortcut: '⌘⇧T' },
    );
  }

  return items;
}

export function buildRemoteContextMenu({ item }) {
  const items = [
    { id: 'remoteConnect', label: item.connected ? '打开' : '连接' },
    { id: 'remoteEdit', label: '编辑连接…' },
  ];

  if (item.connected) {
    items.push({ id: 'remoteDisconnect', label: '断开连接' });
  }

  items.push(
    { type: 'separator' },
    { id: 'remoteDelete', label: '删除配置', danger: true },
  );

  return items;
}

export function buildFolderDropMenu({ hasClipboard }) {
  return [
    { id: 'pasteHere', label: '粘贴到此处', disabled: !hasClipboard },
    { id: 'sep1', type: 'separator' },
    { id: 'open', label: '打开' },
  ];
}

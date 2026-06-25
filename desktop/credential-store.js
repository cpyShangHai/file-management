const { safeStorage } = require('electron');

function isAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptPassword(password) {
  if (!password || !isAvailable()) return null;
  return safeStorage.encryptString(String(password)).toString('base64');
}

function decryptPassword(encoded) {
  if (!encoded || !isAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    return '';
  }
}

module.exports = {
  isAvailable,
  encryptPassword,
  decryptPassword,
};

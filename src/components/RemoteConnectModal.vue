<script setup>
import { FTP_ENCODING_OPTIONS } from "../composables/useRemoteConnections";
import { computed, reactive, ref, watch } from "vue";

const props = defineProps({
  visible: Boolean,
  loading: Boolean,
  initial: { type: Object, default: null },
});

const emit = defineEmits(["confirm", "cancel"]);

const showPassword = ref(false);

const form = reactive({
  name: "",
  protocol: "ftp",
  host: "",
  port: 21,
  username: "",
  password: "",
  secure: false,
  encoding: "gbk",
  savePassword: true,
});

const isEdit = computed(() => Boolean(props.initial?.id));
const hasSavedPassword = computed(() => Boolean(props.initial?.hasPassword));
const canStorePassword = computed(
  () => props.initial?.canStorePassword !== false,
);
const passwordPlaceholder = computed(() => {
  if (form.password) {
    return canStorePassword.value ? "可修改密码" : "";
  }
  if (hasSavedPassword.value) {
    return "已保存，留空则沿用原密码";
  }
  if (canStorePassword.value) {
    return "连接后可加密保存到本机";
  }
  return "当前系统无法加密保存密码";
});

watch(
  () => props.visible,
  async (open) => {
    if (!open) return;
    showPassword.value = false;
    form.name = props.initial?.name || "";
    form.protocol = props.initial?.protocol || "ftp";
    form.host = props.initial?.host || "";
    form.port = props.initial?.port || (form.protocol === "ftp" ? 21 : 22);
    form.username = props.initial?.username || "";
    form.password = "";
    form.secure = Boolean(props.initial?.secure);
    form.encoding = props.initial?.encoding || "gbk";
    form.savePassword = props.initial?.hasPassword ?? true;

    if (
      props.initial?.id &&
      props.initial?.hasPassword &&
      window.fileManager?.remoteGetSavedPassword
    ) {
      try {
        const { password } = await window.fileManager.remoteGetSavedPassword(
          props.initial.id,
        );
        if (password) {
          form.password = password;
          showPassword.value = true;
        }
      } catch {
        /* ignore */
      }
    }
  },
);

watch(
  () => form.protocol,
  (protocol) => {
    if (!props.visible) return;
    form.port = protocol === "ftp" ? 21 : 22;
    if (protocol === "sftp") form.secure = false;
  },
);

function applyUrlFromHost() {
  const raw = form.host.trim();
  const match =
    raw.match(/^(ftps?):\/\/([^/#?]+)/i) || raw.match(/^sftp:\/\/([^/#?]+)/i);
  if (!match) return;

  const isSftp = raw.toLowerCase().startsWith("sftp://");
  form.protocol = isSftp ? "sftp" : "ftp";
  form.secure = !isSftp && match[1].toLowerCase() === "ftps";

  const hostPart = isSftp ? match[1] : match[2];
  if (hostPart.includes(":")) {
    const idx = hostPart.lastIndexOf(":");
    form.host = hostPart.slice(0, idx);
    form.port = Number(hostPart.slice(idx + 1)) || (isSftp ? 22 : 21);
  } else {
    form.host = hostPart;
    form.port = isSftp ? 22 : 21;
  }
}

function submit() {
  applyUrlFromHost();
  emit("confirm", {
    id: props.initial?.id,
    name: form.name.trim(),
    protocol: form.protocol,
    host: form.host.trim(),
    port: Number(form.port) || (form.protocol === "ftp" ? 21 : 22),
    username: form.username.trim(),
    password: form.password,
    secure: form.protocol === "ftp" ? form.secure : false,
    encoding: form.encoding,
    savePassword: canStorePassword.value && form.savePassword,
  });
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="modal-overlay" @click.self="emit('cancel')">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            {{ isEdit ? "编辑远程连接" : "添加远程连接" }}
          </div>
          <div class="modal-body">
            <label class="field">
              <span>名称</span>
              <input
                v-model="form.name"
                class="input"
                placeholder="例如：公司服务器"
              />
            </label>

            <div class="row">
              <label class="field grow">
                <span>协议</span>
                <select v-model="form.protocol" class="input">
                  <option value="sftp">SFTP</option>
                  <option value="ftp">FTP</option>
                </select>
              </label>
              <label class="field port">
                <span>端口</span>
                <input
                  v-model.number="form.port"
                  class="input"
                  type="number"
                  min="1"
                  max="65535"
                />
              </label>
            </div>

            <label class="field">
              <span>主机</span>
              <input
                v-model="form.host"
                class="input"
                placeholder="ftp://XXXXXXX"
                @blur="applyUrlFromHost"
              />
            </label>

            <label class="field">
              <span>用户名</span>
              <input
                v-model="form.username"
                class="input"
                autocomplete="username"
              />
            </label>

            <label class="field">
              <span>密码</span>
              <div class="password-wrap">
                <input
                  v-model="form.password"
                  class="input password-input"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  :placeholder="passwordPlaceholder"
                />
                <button
                  type="button"
                  class="toggle-password"
                  :title="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <svg
                    v-if="showPassword"
                    class="eye-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                  >
                    <path
                      d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.8 10.8 0 0 1 12 5c5 0 9.3 3.1 10.6 7.5a11.2 11.2 0 0 1-2.1 3.6M6.1 6.1A11.2 11.2 0 0 0 1.4 12.5C2.7 16.9 7 20 12 20c1.2 0 2.3-.2 3.4-.5"
                    />
                  </svg>
                  <svg
                    v-else
                    class="eye-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                  >
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </label>

            <label v-if="canStorePassword" class="checkbox">
              <input v-model="form.savePassword" type="checkbox" />
              记住密码（使用系统密钥加密保存）
            </label>

            <label v-if="form.protocol === 'ftp'" class="field">
              <span>文件编码</span>
              <select v-model="form.encoding" class="input">
                <option
                  v-for="opt in FTP_ENCODING_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </label>

            <label v-if="form.protocol === 'ftp'" class="checkbox">
              <input v-model="form.secure" type="checkbox" />
              使用 FTPS（显式 TLS，Serv-U 等老服务器通常不需要）
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn" @click="emit('cancel')">取消</button>
            <button class="btn primary" :disabled="loading" @click="submit">
              {{ loading ? "连接中…" : "连接" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 900;
}

.modal {
  width: 440px;
  max-width: calc(100vw - 32px);
  background: var(--surface);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.modal-header {
  padding: 16px 20px 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.row {
  display: flex;
  gap: 12px;
}

.grow {
  flex: 1;
}

.port {
  width: 96px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  outline: none;
  font-size: 13px;
  color: var(--text);
  background: var(--surface);
}

.input:focus {
  border-color: var(--accent);
}

.password-wrap {
  position: relative;
}

.password-input {
  padding-right: 40px;
}

.toggle-password {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--muted);
}

.toggle-password:hover {
  background: var(--surface-2);
  color: var(--text);
}

.eye-icon {
  width: 18px;
  height: 18px;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 20px 16px;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
}

.btn:hover {
  background: var(--surface-2);
}

.btn.primary {
  background: var(--accent);
  color: #fff;
}

.btn.primary:hover {
  background: var(--accent-hover);
}

.btn.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

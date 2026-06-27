import { authApi } from '../api/auth.js'
import { message } from '../../../shared/plugins/antDesignVue.js'

export default {
  data() {
    return {
      loading: false,
      saving: false,
      username: '',
      current_password: '',
      new_password: '',
      confirm_password: '',
    }
  },
  async mounted() {
    this.loading = true
    try {
      const response = await authApi.me()
      this.username = response.data?.username || ''
    } catch (error) {
      message.error(error.message)
    } finally {
      this.loading = false
    }
  },
  methods: {
    async save() {
      if (this.saving) return
      const username = this.username.trim()
      const currentPassword = this.current_password
      const newPassword = this.new_password

      if (!username || !currentPassword) {
        message.warning('请填写用户名和当前密码')
        return
      }

      if (/\s/.test(currentPassword) || /\s/.test(newPassword)) {
        message.warning('密码不能包含空格')
        return
      }

      if (newPassword && newPassword !== this.confirm_password) {
        message.warning('两次输入的新密码不一致')
        return
      }

      this.saving = true
      try {
        const data = { username, current_password: currentPassword }
        if (newPassword) data.new_password = newPassword

        const response = await authApi.updateUser(data)
        this.username = response.data?.username || username
        this.current_password = ''
        this.new_password = ''
        this.confirm_password = ''
        message.success('个人信息已更新')
      } catch (error) {
        message.error(error.message)
      } finally {
        this.saving = false
      }
    },
  },
  template: `
    <a-card title="个人中心" :loading="loading" style="max-width: 560px">
      <a-form layout="vertical" @submit.prevent="save">
        <a-form-item label="用户名" required>
          <a-input v-model:value="username" autocomplete="username" />
        </a-form-item>
        <a-form-item label="当前密码" required>
          <a-input-password v-model:value="current_password" autocomplete="current-password" />
        </a-form-item>
        <a-divider orientation="left">修改密码</a-divider>
        <a-form-item label="新密码">
          <a-input-password v-model:value="new_password" autocomplete="new-password" placeholder="不修改请留空" />
        </a-form-item>
        <a-form-item label="确认新密码">
          <a-input-password v-model:value="confirm_password" autocomplete="new-password" placeholder="不修改请留空" @pressEnter="save" />
        </a-form-item>
        <a-button type="primary" :loading="saving" @click="save">保存</a-button>
      </a-form>
    </a-card>
  `,
}
